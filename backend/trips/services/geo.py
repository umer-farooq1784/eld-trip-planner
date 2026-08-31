"""Geographic primitives shared by the routing providers."""

from __future__ import annotations

import math
from dataclasses import dataclass

EARTH_RADIUS_MILES = 3958.7613

#: Straight-line distance underestimates road distance. Applied by the
#: keyless fallback router only; real routing returns real road distance.
ROAD_WINDING_FACTOR = 1.18

#: Average speed assumed by the fallback router, in mph.
FALLBACK_AVG_SPEED_MPH = 55.0

US_STATE_ABBREVIATIONS = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "district of columbia": "DC", "florida": "FL", "georgia": "GA", "hawaii": "HI",
    "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
    "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME",
    "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
    "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
    "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
    "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI",
    "south carolina": "SC", "south dakota": "SD", "tennessee": "TN", "texas": "TX",
    "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
}


def abbreviate_state(name: str | None) -> str:
    if not name:
        return ""
    cleaned = name.strip()
    if len(cleaned) == 2 and cleaned.isalpha():
        return cleaned.upper()
    return US_STATE_ABBREVIATIONS.get(cleaned.lower(), cleaned)


def format_place(city: str | None, state: str | None, fallback: str = "") -> str:
    """Render a Remarks-section place name: ``City, ST``. [Guide p.17]"""
    city = (city or "").strip()
    state = abbreviate_state(state)
    if city and state:
        return f"{city}, {state}"
    return city or state or fallback


@dataclass(frozen=True)
class Place:
    label: str
    lat: float
    lon: float

    def as_dict(self) -> dict:
        return {"label": self.label, "lat": self.lat, "lon": self.lon}


def haversine_miles(a: Place | tuple[float, float], b: Place | tuple[float, float]) -> float:
    lat1, lon1 = (a.lat, a.lon) if isinstance(a, Place) else a
    lat2, lon2 = (b.lat, b.lon) if isinstance(b, Place) else b

    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    h = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(min(1.0, h)))


def cumulative_miles(points: list[tuple[float, float]]) -> list[float]:
    """Running distance along a polyline, one entry per point."""
    totals = [0.0]
    for previous, current in zip(points, points[1:]):
        totals.append(totals[-1] + haversine_miles(previous, current))
    return totals


def interpolate_at_mile(
    points: list[tuple[float, float]], totals: list[float], target: float
) -> tuple[float, float]:
    """Find the lat/lon sitting ``target`` miles along a polyline.

    Used to drop rest, fuel and break markers onto the map at the point the
    simulator says they happen.
    """
    if not points:
        raise ValueError("Cannot interpolate along an empty polyline.")
    if target <= 0 or len(points) == 1:
        return points[0]
    if target >= totals[-1]:
        return points[-1]

    low, high = 0, len(totals) - 1
    while low < high:
        mid = (low + high) // 2
        if totals[mid] < target:
            low = mid + 1
        else:
            high = mid

    before = max(0, low - 1)
    span = totals[low] - totals[before]
    ratio = 0.0 if span <= 0 else (target - totals[before]) / span
    lat1, lon1 = points[before]
    lat2, lon2 = points[low]
    return (lat1 + (lat2 - lat1) * ratio, lon1 + (lon2 - lon1) * ratio)
