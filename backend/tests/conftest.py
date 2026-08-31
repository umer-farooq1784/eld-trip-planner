"""Shared stubs. Nothing in the test suite is allowed to touch the network."""

from __future__ import annotations

import pytest

from trips.services.geo import Place
from trips.services.routing import Route, RoutedLeg


class StubProvider:
    """Deterministic routing with straight two-point geometry per leg.

    Road distance is whatever the test says it is, deliberately unrelated to
    the great-circle length of the geometry, which is exactly the mismatch the
    locator has to cope with.
    """

    is_estimated = False

    def __init__(self, legs: list[tuple[float, float]]) -> None:
        self.legs = legs
        self.reverse_calls = 0
        self.geocode_calls = 0

    def geocode(self, query: str, limit: int = 5) -> list[Place]:
        self.geocode_calls += 1
        return [Place(label=query, lat=0.0, lon=0.0)]

    def reverse(self, lat: float, lon: float) -> str:
        self.reverse_calls += 1
        return f"Town {lat:.2f}/{lon:.2f}"

    def route(self, waypoints: list[Place]) -> Route:
        legs = []
        for index, (origin, destination) in enumerate(zip(waypoints, waypoints[1:])):
            miles, hours = self.legs[index]
            legs.append(
                RoutedLeg(
                    origin=origin,
                    destination=destination,
                    distance_miles=miles,
                    duration_hours=hours,
                    geometry=[(origin.lat, origin.lon), (destination.lat, destination.lon)],
                )
            )
        return Route(legs=legs)


@pytest.fixture
def stub_provider():
    return StubProvider([(600.0, 10.0), (900.0, 15.0)])


@pytest.fixture
def places():
    return [
        Place("Origin, TX", 0.0, 0.0),
        Place("Pickup, TX", 0.0, 5.0),
        Place("Dropoff, GA", 0.0, 10.0),
    ]
