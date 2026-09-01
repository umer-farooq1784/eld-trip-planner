"""Turns four trip inputs into a routed, HOS-compliant plan.

Sequence: resolve the three places, route between them, simulate the duty
clocks, name the places where the duty status changes, then persist.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime

from django.db import transaction

from ..models import DailyLog, PlaceCache, Stop, Trip
from . import hos
from .geo import Place, cumulative_miles, interpolate_at_mile
from .routing import Provider, Route, RoutingError, get_provider

logger = logging.getLogger(__name__)

#: Cap on reverse-geocode lookups per plan, so one enormous trip cannot burn
#: through the daily API quota. Beyond this, remarks fall back to mile markers.
MAX_REVERSE_LOOKUPS = 40

#: Reverse geocoding is best-effort decoration on an already-correct plan, so
#: it gets a wall-clock budget rather than being allowed to dominate the
#: request. Anything unresolved when the budget runs out falls back to a mile
#: marker, which is a legal Remarks entry in its own right. [Guide p.17]
REVERSE_LOOKUP_BUDGET_SECONDS = 6.0

#: Concurrent outbound lookups. Pelias allows 100/min, so this stays well
#: inside quota while cutting a dozen sequential round trips to two or three.
LOOKUP_CONCURRENCY = 6


@dataclass
class PlaceInput:
    """Either a free-text query, or coordinates the user already picked."""

    query: str
    lat: float | None = None
    lon: float | None = None

    def resolve(self, provider: Provider) -> Place:
        if self.lat is not None and self.lon is not None:
            return Place(label=self.query, lat=self.lat, lon=self.lon)
        matches = provider.geocode(self.query, limit=1)
        if not matches:
            raise RoutingError(f"Could not find a location matching '{self.query}'.")
        return matches[0]


class _Locator:
    """Names the place at a given trip mileage, memoised on a coarse grid."""

    def __init__(self, provider: Provider, route: Route) -> None:
        self.provider = provider
        self.lookups = 0
        self._by_grid: dict[str, str] = {}

        # Road distance and the length of the drawn polyline are not the same
        # number: the fallback router inflates straight lines by a winding
        # factor, and even real geometry is simplified for transport. Walking
        # the polyline with road miles therefore runs off the end and pins
        # every late stop to the destination. Each leg is instead indexed by
        # its own road-mile span and positions are found by proportion.
        self._legs: list[tuple[float, float, list, list]] = []
        cursor = 0.0
        for leg in route.legs:
            points = leg.geometry or [
                (leg.origin.lat, leg.origin.lon),
                (leg.destination.lat, leg.destination.lon),
            ]
            self._legs.append(
                (cursor, cursor + leg.distance_miles, points, cumulative_miles(points))
            )
            cursor += leg.distance_miles

    def position(self, trip_miles: float) -> tuple[float, float] | None:
        if not self._legs:
            return None

        for index, (start, end, points, totals) in enumerate(self._legs):
            is_last = index == len(self._legs) - 1
            if trip_miles > end and not is_last:
                continue
            span = end - start
            fraction = 0.0 if span <= 0 else (trip_miles - start) / span
            fraction = min(1.0, max(0.0, fraction))
            return interpolate_at_mile(points, totals, fraction * totals[-1])
        return None

    def resolve(self, mileages: list[float]) -> dict[float, str]:
        """Name every distinct place the driver stops at, in one batch.

        Database work stays on this thread and only the HTTP calls fan out:
        Django connections are thread-local, and opening one per worker just
        to read a cache row is not worth the cleanup burden.
        """
        fallback = {m: f"Mile {m:,.0f}" for m in mileages}
        positions = {m: self.position(m) for m in mileages}

        # Distinct grid squares, so two stops in one town cost a single lookup.
        wanted: dict[str, tuple[float, float]] = {}
        key_for_mile: dict[float, str] = {}
        for mile, position in positions.items():
            if position is None:
                continue
            key = PlaceCache.key_for(*position)
            key_for_mile[mile] = key
            wanted.setdefault(key, position)

        resolved: dict[str, str] = {
            row.grid_key: row.label
            for row in PlaceCache.objects.filter(grid_key__in=list(wanted))
        }
        missing = [(k, v) for k, v in wanted.items() if k not in resolved][:MAX_REVERSE_LOOKUPS]

        if missing:
            deadline = time.monotonic() + REVERSE_LOOKUP_BUDGET_SECONDS

            def lookup(item):
                key, (lat, lon) = item
                if time.monotonic() > deadline:
                    return key, lat, lon, ""
                try:
                    return key, lat, lon, self.provider.reverse(lat, lon)
                except Exception:  # noqa: BLE001 - remarks never fail a plan
                    logger.warning("Reverse geocode failed at %.4f,%.4f", lat, lon)
                    return key, lat, lon, ""

            with ThreadPoolExecutor(max_workers=min(LOOKUP_CONCURRENCY, len(missing))) as pool:
                results = list(pool.map(lookup, missing))

            self.lookups += sum(1 for *_, label in results if label)
            fresh = [
                PlaceCache(grid_key=key, lat=lat, lon=lon, label=label)
                for key, lat, lon, label in results
                if label
            ]
            if fresh:
                PlaceCache.objects.bulk_create(fresh, ignore_conflicts=True)
            resolved.update({key: label for key, _, _, label in results if label})

        self._by_grid.update(resolved)
        return {
            mile: resolved.get(key_for_mile.get(mile, ""), fallback[mile])
            for mile in mileages
        }


def plan_trip(
    *,
    current: PlaceInput,
    pickup: PlaceInput,
    dropoff: PlaceInput,
    cycle_used_hours: float,
    start_at: datetime,
    provider: Provider | None = None,
    persist: bool = True,
) -> dict:
    provider = provider or get_provider()

    # The three inputs are independent, so resolve them together rather than
    # paying three sequential round trips.
    with ThreadPoolExecutor(max_workers=3) as pool:
        places = list(pool.map(lambda field: field.resolve(provider), [current, pickup, dropoff]))
    route = provider.route(places)
    if len(route.legs) != 2:
        raise RoutingError("Routing did not return the expected two legs.")

    trip_input = hos.TripInput(
        legs=[
            hos.Leg(
                origin_label=leg.origin.label,
                destination_label=leg.destination.label,
                distance_miles=leg.distance_miles,
                duration_hours=leg.duration_hours,
            )
            for leg in route.legs
        ],
        cycle_used_hours=cycle_used_hours,
        start_at=start_at,
    )

    # Simulate first with a cheap locator, then name only the distinct places
    # the driver actually stops at. Naming during the simulation would fire a
    # reverse lookup for every driving chunk as well.
    simulation = hos.simulate(trip_input, locator=lambda miles: f"@{miles:.1f}")

    locator = _Locator(provider, route)
    placeholders = {
        segment.location: segment.trip_miles_at_start
        for segment in simulation.segments
        if segment.location.startswith("@")
    }
    by_mile = locator.resolve(sorted(set(placeholders.values())))
    resolved = {token: by_mile[mile] for token, mile in placeholders.items()}

    for segment in simulation.segments:
        if segment.location in resolved:
            segment.location = resolved[segment.location]
    for day in simulation.days:
        for segment in day.segments:
            if segment.location.startswith("@"):
                segment.location = resolved.get(segment.location, segment.location)
        for remark in day.remarks:
            if remark.location.startswith("@"):
                remark.location = resolved.get(remark.location, remark.location)

    payload = build_payload(places, route, simulation, cycle_used_hours)
    if persist:
        trip = _persist(places, route, simulation, cycle_used_hours, start_at, payload, locator)
        payload["id"] = str(trip.id)
        payload["created_at"] = trip.created_at.isoformat()
    return payload


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------


def _minute_of_day(moment: datetime, day) -> int:
    return round((moment - datetime.combine(day, datetime.min.time())).total_seconds() / 60)


def build_payload(
    places: list[Place], route: Route, simulation: hos.Simulation, cycle_used_hours: float
) -> dict:
    current, pickup, dropoff = places

    return {
        "id": None,
        "created_at": None,
        "inputs": {
            "current": current.as_dict(),
            "pickup": pickup.as_dict(),
            "dropoff": dropoff.as_dict(),
            "cycle_used_hours": cycle_used_hours,
            "start_at": simulation.start_at.isoformat(),
        },
        "route": {
            "geometry": [[lat, lon] for lat, lon in route.geometry],
            "is_estimated": route.is_estimated,
            "legs": [
                {
                    "origin": leg.origin.as_dict(),
                    "destination": leg.destination.as_dict(),
                    "distance_miles": round(leg.distance_miles, 1),
                    "duration_hours": round(leg.duration_hours, 2),
                    "avg_speed_mph": round(leg.avg_speed_mph, 1),
                }
                for leg in route.legs
            ],
        },
        "summary": {
            "total_miles": round(simulation.total_miles, 1),
            "total_drive_hours": round(simulation.total_drive_hours, 2),
            "total_on_duty_hours": round(simulation.total_on_duty_hours, 2),
            "elapsed_hours": round(simulation.elapsed_hours, 2),
            "start_at": simulation.start_at.isoformat(),
            "end_at": simulation.end_at.isoformat(),
            "sheets": len(simulation.days),
            "cycle_hours_at_start": round(simulation.cycle_hours_at_start, 2),
            "cycle_hours_at_end": round(simulation.cycle_hours_at_end, 2),
            "cycle_hours_remaining": round(
                max(0.0, hos.CYCLE_LIMIT_HOURS - simulation.cycle_hours_at_end), 2
            ),
            "rest_stops": sum(1 for s in simulation.stops if s.kind is hos.StopKind.REST),
            "fuel_stops": sum(1 for s in simulation.stops if s.kind is hos.StopKind.FUEL),
            "breaks": sum(1 for s in simulation.stops if s.kind is hos.StopKind.BREAK),
            "restarts": sum(1 for s in simulation.stops if s.kind is hos.StopKind.RESTART),
        },
        "stops": [
            {
                "order": index,
                "kind": stop.kind.value,
                "label": stop.location,
                "activity": stop.activity,
                "arrive_at": stop.start.isoformat(),
                "depart_at": stop.end.isoformat(),
                "duration_hours": round(stop.hours, 2),
                "trip_miles": round(stop.trip_miles_at_start, 1),
            }
            for index, stop in enumerate(simulation.stops)
        ],
        "days": [
            {
                "date": day.day.isoformat(),
                "sheet_number": day.sheet_number,
                "total_sheets": day.total_sheets,
                "miles": round(day.miles, 1),
                "totals": {duty.value: round(hours, 2) for duty, hours in day.totals.items()},
                "total_hours": round(day.total_hours, 2),
                "segments": [
                    {
                        "duty": segment.duty.value,
                        "row": segment.duty.row,
                        "start_minute": _minute_of_day(segment.start, day.day),
                        "end_minute": _minute_of_day(segment.end, day.day),
                        "activity": segment.activity,
                        "location": segment.location,
                        "kind": segment.kind.value if segment.kind else None,
                    }
                    for segment in day.segments
                ],
                "remarks": [
                    {
                        "minute": remark.minute_of_day,
                        "location": remark.location,
                        "activity": remark.activity,
                        "duty": remark.duty.value,
                    }
                    for remark in day.remarks
                ],
                "recap": {
                    "on_duty_today": round(day.recap.on_duty_today, 2),
                    "hours_last_7_days": round(day.recap.hours_last_7_days, 2),
                    "hours_available_tomorrow": round(day.recap.hours_available_tomorrow, 2),
                    "hours_last_8_days": round(day.recap.hours_last_8_days, 2),
                },
            }
            for day in simulation.days
        ],
    }


@transaction.atomic
def _persist(places, route, simulation, cycle_used_hours, start_at, payload, locator) -> Trip:
    current, pickup, dropoff = places
    trip = Trip.objects.create(
        current_label=current.label, current_lat=current.lat, current_lon=current.lon,
        pickup_label=pickup.label, pickup_lat=pickup.lat, pickup_lon=pickup.lon,
        dropoff_label=dropoff.label, dropoff_lat=dropoff.lat, dropoff_lon=dropoff.lon,
        cycle_used_hours=cycle_used_hours,
        start_at=start_at,
        end_at=simulation.end_at,
        total_miles=simulation.total_miles,
        total_drive_hours=simulation.total_drive_hours,
        total_on_duty_hours=simulation.total_on_duty_hours,
        cycle_hours_at_end=simulation.cycle_hours_at_end,
        route_geometry=payload["route"]["geometry"],
        legs=payload["route"]["legs"],
        route_is_estimated=route.is_estimated,
    )

    Stop.objects.bulk_create(
        Stop(
            trip=trip,
            order=entry["order"],
            kind=entry["kind"],
            label=entry["label"],
            activity=entry["activity"],
            arrive_at=entry["arrive_at"],
            depart_at=entry["depart_at"],
            duration_hours=entry["duration_hours"],
            trip_miles=entry["trip_miles"],
            **_coords(locator, entry["trip_miles"]),
        )
        for entry in payload["stops"]
    )

    DailyLog.objects.bulk_create(
        DailyLog(
            trip=trip,
            day=entry["date"],
            sheet_number=entry["sheet_number"],
            total_sheets=entry["total_sheets"],
            miles=entry["miles"],
            off_hours=entry["totals"]["OFF"],
            sleeper_hours=entry["totals"]["SB"],
            driving_hours=entry["totals"]["D"],
            on_duty_hours=entry["totals"]["ON"],
            segments=entry["segments"],
            remarks=entry["remarks"],
            recap=entry["recap"],
        )
        for entry in payload["days"]
    )
    return trip


def _coords(locator: _Locator, trip_miles: float) -> dict:
    position = locator.position(trip_miles)
    return {"lat": position[0], "lon": position[1]} if position else {"lat": None, "lon": None}
