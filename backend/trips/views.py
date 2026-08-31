"""API views. Trip planning lands here once routing is wired up."""

from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import exception_handler


class ApiError(Exception):
    """An error worth showing to the user verbatim."""

    def __init__(self, message: str, http_status: int = status.HTTP_400_BAD_REQUEST) -> None:
        super().__init__(message)
        self.message = message
        self.http_status = http_status


def api_exception_handler(exc, context):
    """Return a consistent ``{"error": ...}`` body instead of DRF's default shapes."""
    if isinstance(exc, ApiError):
        return Response({"error": exc.message}, status=exc.http_status)

    response = exception_handler(exc, context)
    if response is None:
        return None

    detail = response.data
    if isinstance(detail, dict) and "detail" in detail:
        response.data = {"error": str(detail["detail"])}
    else:
        response.data = {"error": "Request could not be processed.", "fields": detail}
    return response


@api_view(["GET"])
def healthz(request):
    """Cheap liveness probe, also used by the keep-alive ping."""
    return Response({"status": "ok"})
