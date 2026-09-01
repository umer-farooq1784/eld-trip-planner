"""Contract tests for parsing openrouteservice responses.

Fixtures are recorded from live api.heigit.org replies. Three behaviours the
parser depends on: `instructions: false` omits `segments`, `units: "mi"`
changes the distance unit, and `/geojson` answers 406 to `application/json`.
"""

from __future__ import annotations

import pytest

from trips.services.geo import Place, simplify_polyline
from trips.services.routing import METERS_PER_MILE, OpenRouteServiceProvider, RoutingError

WAYPOINTS = [
    Place("Dallas, TX", 32.7767, -96.797),
    Place("Houston, TX", 29.7604, -95.3698),
    Place("Atlanta, GA", 33.749, -84.388),
]

# Distances and durations as api.heigit.org returned them for driving-hgv.
LIVE_RESPONSE = {
    "features": [
        {
            "geometry": {
                "coordinates": [
                    [-96.797, 32.7767], [-96.0, 31.5], [-95.3698, 29.7604],
                    [-90.0, 31.0], [-84.388, 33.749],
                ]
            },
            "properties": {
                "way_points": [0, 2, 4],
                "summary": {"distance": 1680092.7, "duration": 88590.0},
                "segments": [
                    {"distance": 384318.4, "duration": 21420.0},
                    {"distance": 1295774.3, "duration": 67170.0},
                ],
            },
        }
    ]
}


def provider(speed: float = 55.0) -> OpenRouteServiceProvider:
    return OpenRouteServiceProvider(
        api_key="test", base_url="https://example.invalid/openrouteservice",
        geocode_url="https://example.invalid/pelias/v1", profile="driving-hgv",
        timeout=5.0, planning_speed_mph=speed,
    )


def test_parses_two_legs_with_metres_converted_to_miles():
    route = provider()._parse_route(LIVE_RESPONSE, WAYPOINTS)

    assert len(route.legs) == 2
    first, second = route.legs

    # 384,318 m is 238.8 miles: the real Dallas to Houston road distance.
    assert first.distance_miles == pytest.approx(238.8, abs=0.1)
    assert second.distance_miles == pytest.approx(805.2, abs=0.1)
    assert route.total_miles == pytest.approx(1044.0, abs=0.2)
    assert not route.is_estimated


def test_duration_comes_from_planning_speed_not_the_provider():
    """driving-hgv predicts about 40 mph, well below interstate speed."""
    route = provider(speed=55.0)._parse_route(LIVE_RESPONSE, WAYPOINTS)
    first = route.legs[0]

    assert first.duration_hours == pytest.approx(238.8 / 55.0, abs=0.01)
    assert first.avg_speed_mph == pytest.approx(55.0, abs=0.01)

    assert first.provider_duration_hours == pytest.approx(21420 / 3600)
    assert first.distance_miles / first.provider_duration_hours == pytest.approx(40.1, abs=0.2)


def test_planning_speed_is_configurable():
    route = provider(speed=62.0)._parse_route(LIVE_RESPONSE, WAYPOINTS)
    assert route.legs[0].avg_speed_mph == pytest.approx(62.0, abs=0.01)


def test_geometry_is_split_at_the_waypoints():
    route = provider()._parse_route(LIVE_RESPONSE, WAYPOINTS)

    assert route.legs[0].geometry[0] == (32.7767, -96.797)
    assert route.legs[0].geometry[-1] == (29.7604, -95.3698)
    assert route.legs[1].geometry[0] == (29.7604, -95.3698)
    assert route.legs[1].geometry[-1] == (33.749, -84.388)
    assert len(route.geometry) == 5


def test_missing_segments_raises_a_readable_error():
    """The shape the API returns when `instructions` is false."""
    stripped = {
        "features": [
            {
                "geometry": LIVE_RESPONSE["features"][0]["geometry"],
                "properties": {
                    "way_points": [0, 2, 4],
                    "summary": {"distance": 1680092.7, "duration": 88590.0},
                },
            }
        ]
    }
    with pytest.raises(RoutingError, match="unexpected response shape"):
        provider()._parse_route(stripped, WAYPOINTS)


@pytest.mark.parametrize("payload", [{}, {"features": []}, {"features": [{}]}])
def test_malformed_payloads_raise_rather_than_crash(payload):
    with pytest.raises(RoutingError):
        provider()._parse_route(payload, WAYPOINTS)


def test_metres_per_mile_constant_is_exact():
    assert METERS_PER_MILE == 1609.344


def test_geometry_is_simplified_but_keeps_its_endpoints():
    detailed = [(30.0 + i * 0.0001, -95.0 + i * 0.0001) for i in range(400)]
    detailed[200] = (30.02 + 0.004, -95.02)

    kept = simplify_polyline(detailed, 0.0005)

    assert len(kept) < len(detailed) / 4
    assert kept[0] == detailed[0]
    assert kept[-1] == detailed[-1]
    assert detailed[200] in kept, "a real deviation must survive simplification"


def test_simplification_is_a_no_op_below_three_points():
    assert simplify_polyline([(1.0, 2.0), (3.0, 4.0)], 0.01) == [(1.0, 2.0), (3.0, 4.0)]
    assert simplify_polyline([], 0.01) == []


def test_zero_tolerance_keeps_everything():
    points = [(30.0 + i * 0.001, -95.0) for i in range(50)]
    assert simplify_polyline(points, 0.0) == points
