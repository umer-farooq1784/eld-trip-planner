"""Request validation and read-side reconstruction of stored trips."""

from __future__ import annotations

from datetime import datetime, timedelta

from rest_framework import serializers

from .models import Trip
from .services import hos

#: A log covers the rolling 8-day cycle, so a start earlier than that cannot
#: be reconciled against the recap. Ahead, this is a planning horizon.
EARLIEST_START_DAYS = 8
LATEST_START_DAYS = 30


class PlaceInputSerializer(serializers.Serializer):
    query = serializers.CharField(max_length=255, trim_whitespace=True)
    lat = serializers.FloatField(required=False, allow_null=True, min_value=-90, max_value=90)
    lon = serializers.FloatField(required=False, allow_null=True, min_value=-180, max_value=180)

    def validate(self, attrs):
        if (attrs.get("lat") is None) != (attrs.get("lon") is None):
            raise serializers.ValidationError("Provide both lat and lon, or neither.")
        return attrs


class PlanTripSerializer(serializers.Serializer):
    """The four inputs from the brief, plus a start time defaulting to now."""

    current = PlaceInputSerializer()
    pickup = PlaceInputSerializer()
    dropoff = PlaceInputSerializer()
    cycle_used_hours = serializers.FloatField(min_value=0, max_value=hos.CYCLE_LIMIT_HOURS)
    start_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate_start_at(self, value):
        if value is None:
            return value
        if value.tzinfo is not None:
            # Logs run on a single home-terminal clock, so drop any offset
            # rather than silently shifting the driver's day. [Guide p.16]
            value = value.replace(tzinfo=None)

        now = datetime.now()
        if value < now - timedelta(days=EARLIEST_START_DAYS):
            raise serializers.ValidationError(
                f"Cannot start more than {EARLIEST_START_DAYS} days in the past."
            )
        if value > now + timedelta(days=LATEST_START_DAYS):
            raise serializers.ValidationError(
                f"Cannot start more than {LATEST_START_DAYS} days ahead."
            )
        return value

    def validate(self, attrs):
        attrs.setdefault("start_at", None)
        if attrs["start_at"] is None:
            attrs["start_at"] = datetime.now().replace(second=0, microsecond=0)
        return attrs


class TripListSerializer(serializers.ModelSerializer):
    sheets = serializers.IntegerField(source="daily_logs.count", read_only=True)

    class Meta:
        model = Trip
        fields = (
            "id", "created_at", "start_at", "end_at",
            "current_label", "pickup_label", "dropoff_label",
            "cycle_used_hours", "total_miles", "total_drive_hours", "sheets",
        )


def payload_from_trip(trip: Trip) -> dict:
    """Rebuild the plan response from the relational tables."""
    stops = list(trip.stops.all())
    days = list(trip.daily_logs.all())

    def count(kind: str) -> int:
        return sum(1 for stop in stops if stop.kind == kind)

    return {
        "id": str(trip.id),
        "created_at": trip.created_at.isoformat(),
        "inputs": {
            "current": {"label": trip.current_label, "lat": trip.current_lat, "lon": trip.current_lon},
            "pickup": {"label": trip.pickup_label, "lat": trip.pickup_lat, "lon": trip.pickup_lon},
            "dropoff": {"label": trip.dropoff_label, "lat": trip.dropoff_lat, "lon": trip.dropoff_lon},
            "cycle_used_hours": trip.cycle_used_hours,
            "start_at": trip.start_at.isoformat(),
        },
        "route": {
            "geometry": trip.route_geometry,
            "legs": trip.legs,
            "is_estimated": trip.route_is_estimated,
        },
        "summary": {
            "total_miles": round(trip.total_miles, 1),
            "total_drive_hours": round(trip.total_drive_hours, 2),
            "total_on_duty_hours": round(trip.total_on_duty_hours, 2),
            "elapsed_hours": round(trip.elapsed_hours, 2),
            "start_at": trip.start_at.isoformat(),
            "end_at": trip.end_at.isoformat(),
            "sheets": len(days),
            "cycle_hours_at_start": round(trip.cycle_used_hours, 2),
            "cycle_hours_at_end": round(trip.cycle_hours_at_end, 2),
            "cycle_hours_remaining": round(
                max(0.0, hos.CYCLE_LIMIT_HOURS - trip.cycle_hours_at_end), 2
            ),
            "rest_stops": count("rest"),
            "fuel_stops": count("fuel"),
            "breaks": count("break"),
            "restarts": count("restart"),
        },
        "stops": [
            {
                "order": stop.order,
                "kind": stop.kind,
                "label": stop.label,
                "activity": stop.activity,
                "arrive_at": stop.arrive_at.isoformat(),
                "depart_at": stop.depart_at.isoformat(),
                "duration_hours": stop.duration_hours,
                "trip_miles": stop.trip_miles,
                "cycle_hours": stop.cycle_hours,
                "lat": stop.lat,
                "lon": stop.lon,
            }
            for stop in stops
        ],
        "days": [
            {
                "date": log.day.isoformat(),
                "sheet_number": log.sheet_number,
                "total_sheets": log.total_sheets,
                "miles": log.miles,
                "totals": {
                    "OFF": log.off_hours,
                    "SB": log.sleeper_hours,
                    "D": log.driving_hours,
                    "ON": log.on_duty_hours,
                },
                "total_hours": round(log.total_hours, 2),
                "segments": log.segments,
                "remarks": log.remarks,
                "recap": log.recap,
            }
            for log in days
        ],
    }
