"""Geocoding and routing providers.

Two implementations behind one interface:

``OpenRouteServiceProvider``
    The real one. Uses the ``driving-hgv`` truck profile, so distances and
    durations account for lorry restrictions rather than car routing.

``FallbackProvider``
    Keyless. Geocodes through Nominatim and estimates road distance from the
    great-circle distance. Used when ``ORS_API_KEY`` is unset, and as a safety
    net if OpenRouteService is unreachable or rate-limited mid-demo. Results
    are approximate and the API says so, so the UI can label them.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Protocol

import requests
from django.conf import settings

from .geo import (
    FALLBACK_AVG_SPEED_MPH,
    ROAD_WINDING_FACTOR,
    Place,
    cumulative_miles,
    format_place,
    haversine_miles,
)

logger = logging.getLogger(__name__)

METERS_PER_MILE = 1609.344
NOMINATIM_URL = "https://nominatim.openstreetmap.org"
USER_AGENT = "eld-trip-planner/1.0 (HOS compliance demo)"


class RoutingError(Exception):
    """Raised when a place cannot be resolved or a route cannot be built."""


@dataclass
class RoutedLeg:
    origin: Place
    destination: Place
    distance_miles: float
    duration_hours: float
    geometry: list[tuple[float, float]] = field(default_factory=list)
    #: What the routing provider itself predicted, kept for comparison.
    provider_duration_hours: float | None = None

    @property
    def avg_speed_mph(self) -> float:
        return self.distance_miles / self.duration_hours if self.duration_hours else 0.0


@dataclass
class Route:
    legs: list[RoutedLeg]
    is_estimated: bool = False

    @property
    def geometry(self) -> list[tuple[float, float]]:
        """All legs concatenated, without repeating the shared waypoints."""
        points: list[tuple[float, float]] = []
        for leg in self.legs:
            chunk = leg.geometry
            if points and chunk and chunk[0] == points[-1]:
                chunk = chunk[1:]
            points.extend(chunk)
        return points

    @property
    def total_miles(self) -> float:
        return sum(leg.distance_miles for leg in self.legs)

    @property
    def total_hours(self) -> float:
        return sum(leg.duration_hours for leg in self.legs)


class Provider(Protocol):
    is_estimated: bool

    def geocode(self, query: str, limit: int = 5) -> list[Place]: ...
    def reverse(self, lat: float, lon: float) -> str: ...
    def route(self, waypoints: list[Place]) -> Route: ...


# ---------------------------------------------------------------------------
# OpenRouteService
# ---------------------------------------------------------------------------


class OpenRouteServiceProvider:
    is_estimated = False

    def __init__(
        self,
        api_key: str,
        base_url: str,
        geocode_url: str,
        profile: str,
        timeout: float,
        planning_speed_mph: float,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.geocode_url = geocode_url.rstrip("/")
        self.profile = profile
        self.timeout = timeout
        self.planning_speed_mph = planning_speed_mph

    @property
    def _auth_headers(self) -> dict:
        # HeiGIT accepts the key as a bearer-style Authorization header on every
        # service. Keys issued since the 2025 migration are JWTs.
        return {
            "Authorization": self.api_key,
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        }

    def _get(self, url: str, params: dict) -> dict:
        response = requests.get(
            url,
            params=params,
            headers=self._auth_headers,
            timeout=self.timeout,
        )
        if response.status_code == 429:
            raise RoutingError("Map service rate limit reached. Please try again shortly.")
        response.raise_for_status()
        return response.json()

    @staticmethod
    def _place_from_feature(feature: dict) -> Place:
        props = feature.get("properties", {})
        lon, lat = feature["geometry"]["coordinates"][:2]
        city = props.get("locality") or props.get("localadmin") or props.get("county")
        label = format_place(city, props.get("region_a") or props.get("region"))
        return Place(label=label or props.get("label", "Unknown"), lat=lat, lon=lon)

    def geocode(self, query: str, limit: int = 5) -> list[Place]:
        data = self._get(
            f"{self.geocode_url}/search",
            {"text": query, "size": limit, "boundary.country": "USA"},
        )
        return [self._place_from_feature(f) for f in data.get("features", [])]

    def reverse(self, lat: float, lon: float) -> str:
        data = self._get(
            f"{self.geocode_url}/reverse",
            {"point.lat": lat, "point.lon": lon, "size": 1,
             "layers": "locality,localadmin,county"},
        )
        features = data.get("features", [])
        return self._place_from_feature(features[0]).label if features else ""

    def route(self, waypoints: list[Place]) -> Route:
        response = requests.post(
            f"{self.base_url}/v2/directions/{self.profile}/geojson",
            # `instructions: false` makes the API omit `segments` entirely, and
            # segments are the only source of per-leg distance. Units are left
            # at the default (metres) and converted here.
            json={"coordinates": [[p.lon, p.lat] for p in waypoints]},
            headers={
                **self._auth_headers,
                "Content-Type": "application/json",
                # The geojson endpoint rejects application/json with a 406.
                "Accept": "application/geo+json",
            },
            timeout=self.timeout,
        )
        if response.status_code == 429:
            raise RoutingError("Map service rate limit reached. Please try again shortly.")
        if response.status_code >= 400:
            raise RoutingError(_describe_ors_error(response))

        return self._parse_route(response.json(), waypoints)

    def _parse_route(self, payload: dict, waypoints: list[Place]) -> Route:
        try:
            feature = payload["features"][0]
            points = [(lat, lon) for lon, lat in feature["geometry"]["coordinates"]]
            props = feature["properties"]
            segments = props["segments"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RoutingError(
                "The routing service returned an unexpected response shape."
            ) from exc

        cuts = props.get("way_points") or [0, len(points) - 1]
        legs: list[RoutedLeg] = []
        for index, segment in enumerate(segments):
            start, end = cuts[index], cuts[index + 1]
            miles = segment["distance"] / METERS_PER_MILE
            legs.append(
                RoutedLeg(
                    origin=waypoints[index],
                    destination=waypoints[index + 1],
                    distance_miles=miles,
                    duration_hours=miles / self.planning_speed_mph,
                    provider_duration_hours=segment["duration"] / 3600.0,
                    geometry=points[start : end + 1],
                )
            )
        return Route(legs=legs)


def _describe_ors_error(response: requests.Response) -> str:
    try:
        payload = response.json().get("error")
    except ValueError:
        payload = None
    message = payload.get("message") if isinstance(payload, dict) else payload
    if not message:
        return f"Route service returned HTTP {response.status_code}."
    if "2010" in str(message) or "not found" in str(message).lower():
        return "No road route could be found between those locations."
    return str(message)


# ---------------------------------------------------------------------------
# Keyless fallback
# ---------------------------------------------------------------------------


class FallbackProvider:
    """Nominatim geocoding plus a great-circle distance estimate."""

    is_estimated = True

    def __init__(self, timeout: float = 15.0) -> None:
        self.timeout = timeout

    def _get(self, path: str, params: dict) -> object:
        response = requests.get(
            f"{NOMINATIM_URL}{path}",
            params={**params, "format": "jsonv2", "addressdetails": 1},
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    @staticmethod
    def _label(address: dict, fallback: str) -> str:
        city = (
            address.get("city")
            or address.get("town")
            or address.get("village")
            or address.get("hamlet")
            or address.get("county")
        )
        return format_place(city, address.get("state"), fallback=fallback)

    def geocode(self, query: str, limit: int = 5) -> list[Place]:
        results = self._get(
            "/search", {"q": query, "countrycodes": "us", "limit": limit}
        )
        places = []
        for item in results or []:
            label = self._label(
                item.get("address", {}), fallback=item.get("display_name", query)
            )
            places.append(Place(label=label, lat=float(item["lat"]), lon=float(item["lon"])))
        return places

    def reverse(self, lat: float, lon: float) -> str:
        try:
            result = self._get("/reverse", {"lat": lat, "lon": lon, "zoom": 10})
        except requests.RequestException:
            return ""
        return self._label((result or {}).get("address", {}), fallback="")

    def route(self, waypoints: list[Place]) -> Route:
        legs = []
        for origin, destination in zip(waypoints, waypoints[1:]):
            miles = haversine_miles(origin, destination) * ROAD_WINDING_FACTOR
            legs.append(
                RoutedLeg(
                    origin=origin,
                    destination=destination,
                    distance_miles=miles,
                    duration_hours=miles / FALLBACK_AVG_SPEED_MPH,
                    geometry=[(origin.lat, origin.lon), (destination.lat, destination.lon)],
                )
            )
        return Route(legs=legs, is_estimated=True)


def get_provider() -> Provider:
    if settings.ORS_API_KEY:
        return OpenRouteServiceProvider(
            api_key=settings.ORS_API_KEY,
            base_url=settings.ORS_BASE_URL,
            geocode_url=settings.ORS_GEOCODE_URL,
            profile=settings.ORS_PROFILE,
            timeout=settings.ORS_TIMEOUT_SECONDS,
            planning_speed_mph=settings.PLANNING_SPEED_MPH,
        )
    logger.warning("ORS_API_KEY is unset; falling back to estimated distances.")
    return FallbackProvider()
