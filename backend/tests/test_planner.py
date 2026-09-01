"""Planner tests: mile-to-map placement, persistence round-trip, and the API."""

from __future__ import annotations

from datetime import datetime

import pytest

from trips.models import Trip
from trips.serializers import payload_from_trip
from trips.services.planner import PlaceInput, _Locator, plan_trip

START = datetime(2026, 9, 1, 6, 0)


def inputs():
    return {
        "current": PlaceInput("Origin, TX", 0.0, 0.0),
        "pickup": PlaceInput("Pickup, TX", 0.0, 5.0),
        "dropoff": PlaceInput("Dropoff, GA", 0.0, 10.0),
    }


# ---------------------------------------------------------------------------
# Placing stops on the map
# ---------------------------------------------------------------------------


def test_locator_maps_road_miles_onto_the_polyline_by_proportion(stub_provider, places):
    """Regression: road miles are not polyline miles.

    Leg one is reported as 600 road miles but its geometry spans only ~345
    great-circle miles. Walking the polyline with raw road miles ran off the
    end and pinned every later stop to the destination, so a fuel stop 92
    miles short of Atlanta was labelled "Atlanta, GA".
    """
    route = stub_provider.route(places)
    locator = _Locator(stub_provider, route)

    assert locator.position(0.0) == pytest.approx((0.0, 0.0))
    # Halfway along leg one by road miles is halfway along its geometry.
    assert locator.position(300.0) == pytest.approx((0.0, 2.5))
    assert locator.position(600.0) == pytest.approx((0.0, 5.0))
    # Two thirds along leg two.
    assert locator.position(600.0 + 600.0) == pytest.approx((0.0, 5.0 + 10 / 3), abs=1e-6)
    assert locator.position(1500.0) == pytest.approx((0.0, 10.0))


def test_locator_clamps_beyond_the_final_mile(stub_provider, places):
    locator = _Locator(stub_provider, stub_provider.route(places))
    assert locator.position(99_999.0) == pytest.approx((0.0, 10.0))


@pytest.mark.django_db
def test_reverse_lookups_are_cached_across_nearby_stops(stub_provider):
    plan_trip(**inputs(), cycle_used_hours=0.0, start_at=START, provider=stub_provider)
    first_pass = stub_provider.reverse_calls
    assert first_pass > 0

    stub_provider.reverse_calls = 0
    plan_trip(**inputs(), cycle_used_hours=0.0, start_at=START, provider=stub_provider)
    assert stub_provider.reverse_calls == 0, "second identical plan should hit the place cache"


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_stored_trip_reconstructs_the_same_plan(stub_provider):
    planned = plan_trip(**inputs(), cycle_used_hours=12.0, start_at=START, provider=stub_provider)

    trip = Trip.objects.get(pk=planned["id"])
    rebuilt = payload_from_trip(trip)

    assert rebuilt["summary"] == planned["summary"]
    assert rebuilt["days"] == planned["days"]
    assert [s["kind"] for s in rebuilt["stops"]] == [s["kind"] for s in planned["stops"]]
    assert trip.stops.count() == len(planned["stops"])
    assert trip.daily_logs.count() == planned["summary"]["sheets"]


@pytest.mark.django_db
def test_every_stored_sheet_still_totals_twenty_four_hours(stub_provider):
    planned = plan_trip(**inputs(), cycle_used_hours=30.0, start_at=START, provider=stub_provider)
    trip = Trip.objects.get(pk=planned["id"])
    for log in trip.daily_logs.all():
        assert log.total_hours == pytest.approx(24.0, abs=1e-6)


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


@pytest.fixture
def api(client, stub_provider, monkeypatch):
    monkeypatch.setattr("trips.services.planner.get_provider", lambda: stub_provider)
    monkeypatch.setattr("trips.views.get_provider", lambda: stub_provider)
    return client


def body(**overrides):
    payload = {
        "current": {"query": "Origin, TX", "lat": 0.0, "lon": 0.0},
        "pickup": {"query": "Pickup, TX", "lat": 0.0, "lon": 5.0},
        "dropoff": {"query": "Dropoff, GA", "lat": 0.0, "lon": 10.0},
        "cycle_used_hours": 12.0,
        "start_at": "2026-09-01T06:00:00",
    }
    payload.update(overrides)
    return payload


@pytest.mark.django_db
def test_post_trip_returns_a_complete_plan(api):
    response = api.post("/api/trips/", body(), content_type="application/json")
    assert response.status_code == 201

    data = response.json()
    assert data["id"]
    assert data["summary"]["sheets"] == len(data["days"])
    assert data["route"]["geometry"]
    for day in data["days"]:
        assert day["total_hours"] == pytest.approx(24.0, abs=1e-6)
        assert day["segments"][0]["start_minute"] == 0
        assert day["segments"][-1]["end_minute"] == 1440


@pytest.mark.django_db
def test_history_lists_saved_trips(api):
    api.post("/api/trips/", body(), content_type="application/json")
    api.post("/api/trips/", body(cycle_used_hours=40.0), content_type="application/json")

    listing = api.get("/api/trips/").json()["results"]
    assert len(listing) == 2
    assert {row["cycle_used_hours"] for row in listing} == {12.0, 40.0}


@pytest.mark.django_db
def test_trip_detail_round_trips(api):
    created = api.post("/api/trips/", body(), content_type="application/json").json()
    fetched = api.get(f"/api/trips/{created['id']}/").json()
    assert fetched["summary"] == created["summary"]
    assert fetched["days"] == created["days"]


@pytest.mark.django_db
@pytest.mark.parametrize(
    "override",
    [
        {"cycle_used_hours": -1},
        {"cycle_used_hours": 71},
        {"current": {"query": "Origin", "lat": 1.0}},
    ],
)
def test_invalid_input_is_rejected_with_a_readable_error(api, override):
    response = api.post("/api/trips/", body(**override), content_type="application/json")
    assert response.status_code == 400
    assert "error" in response.json()


@pytest.mark.django_db
def test_missing_trip_returns_404(api):
    response = api.get("/api/trips/00000000-0000-0000-0000-000000000000/")
    assert response.status_code == 404
    assert "error" in response.json()


@pytest.mark.django_db
def test_start_time_defaults_to_now(api):
    payload = body()
    payload.pop("start_at")
    response = api.post("/api/trips/", payload, content_type="application/json")
    assert response.status_code == 201
    assert response.json()["summary"]["start_at"]


def test_healthz_reports_the_active_router(api):
    response = api.get("/api/healthz/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_geocode_ignores_short_queries(api, stub_provider):
    assert api.get("/api/geocode/?q=ab").json()["results"] == []
    assert stub_provider.geocode_calls == 0
    assert api.get("/api/geocode/?q=Dallas").json()["results"]


@pytest.mark.django_db
def test_fresh_plans_carry_stop_coordinates(api):
    """Regression: the map drew the route but no stop markers.

    Coordinates were only computed on the persistence path, so a freshly
    planned trip came back with lat/lon null on every stop and the pins only
    appeared if you reloaded the trip from history -- which is not the flow
    anyone actually uses.
    """
    created = api.post("/api/trips/", body(), content_type="application/json").json()

    assert created["stops"], "expected at least a pickup and a dropoff"
    for stop in created["stops"]:
        assert stop["lat"] is not None, f"{stop['kind']} stop has no latitude"
        assert stop["lon"] is not None, f"{stop['kind']} stop has no longitude"

    # And the stored copy must agree with what was just returned.
    fetched = api.get(f"/api/trips/{created['id']}/").json()
    assert [(s["lat"], s["lon"]) for s in fetched["stops"]] == [
        (s["lat"], s["lon"]) for s in created["stops"]
    ]
