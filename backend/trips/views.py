"""API views."""

from __future__ import annotations

import logging

import requests
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import exception_handler

from .models import Trip
from .serializers import PlanTripSerializer, TripListSerializer, payload_from_trip
from .services import hos
from .services.planner import PlaceInput, plan_trip
from .services.routing import RoutingError, get_provider

logger = logging.getLogger(__name__)

MAX_HISTORY = 25


class ApiError(Exception):
    """An error worth showing to the user verbatim."""

    def __init__(self, message: str, http_status: int = status.HTTP_400_BAD_REQUEST) -> None:
        super().__init__(message)
        self.message = message
        self.http_status = http_status


def api_exception_handler(exc, context):
    """Return a consistent ``{"error": ...}`` body instead of DRF's default shapes."""
    if isinstance(exc, (ApiError, RoutingError, hos.HosError)):
        code = getattr(exc, "http_status", status.HTTP_400_BAD_REQUEST)
        return Response({"error": str(exc)}, status=code)

    if isinstance(exc, requests.Timeout):
        return Response(
            {"error": "The map service took too long to respond. Please try again."},
            status=status.HTTP_504_GATEWAY_TIMEOUT,
        )
    if isinstance(exc, requests.RequestException):
        logger.exception("Upstream map service failed")
        return Response(
            {"error": "The map service is unavailable right now. Please try again shortly."},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    response = exception_handler(exc, context)
    if response is None:
        return None

    detail = response.data
    if isinstance(detail, dict) and "detail" in detail:
        response.data = {"error": str(detail["detail"])}
    elif isinstance(detail, dict):
        response.data = {"error": _first_field_error(detail), "fields": detail}
    else:
        response.data = {"error": "Request could not be processed."}
    return response


FIELD_NAMES = {
    "current": "Current location",
    "pickup": "Pickup location",
    "dropoff": "Dropoff location",
    "cycle_used_hours": "Current cycle used",
    "start_at": "Trip start",
}


def _first_field_error(detail: dict) -> str:
    for field, problem in detail.items():
        label = FIELD_NAMES.get(field, field)
        while isinstance(problem, dict):
            _, problem = next(iter(problem.items()))
        text = problem[0] if isinstance(problem, list) and problem else str(problem)
        return f"{label}: {text}"
    return "Please check the form and try again."


@api_view(["GET"])
def healthz(request):
    """Cheap liveness probe, also used by the keep-alive ping."""
    return Response(
        {
            "status": "ok",
            "routing": "openrouteservice" if not get_provider().is_estimated else "estimated",
        }
    )


@api_view(["GET"])
def geocode(request):
    """Autocomplete for the three location inputs."""
    query = request.query_params.get("q", "").strip()
    if len(query) < 3:
        return Response({"results": []})

    places = get_provider().geocode(query, limit=6)
    response = Response({"results": [place.as_dict() for place in places]})
    # Place coordinates do not move, so let the browser keep them.
    response["Cache-Control"] = "public, max-age=3600, stale-while-revalidate=86400"
    return response


@api_view(["GET", "POST"])
def trips(request):
    if request.method == "GET":
        queryset = Trip.objects.prefetch_related("daily_logs")[:MAX_HISTORY]
        return Response({"results": TripListSerializer(queryset, many=True).data})

    serializer = PlanTripSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    payload = plan_trip(
        current=PlaceInput(**data["current"]),
        pickup=PlaceInput(**data["pickup"]),
        dropoff=PlaceInput(**data["dropoff"]),
        cycle_used_hours=data["cycle_used_hours"],
        start_at=data["start_at"],
    )
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def trip_detail(request, trip_id):
    trip = get_object_or_404(
        Trip.objects.prefetch_related("stops", "daily_logs"), pk=trip_id
    )
    return Response(payload_from_trip(trip))
