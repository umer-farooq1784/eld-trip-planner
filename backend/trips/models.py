"""Persistence for planned trips.

Segments and remarks are stored as JSON on the daily log: they are a rendering
payload consumed whole by the log sheet, never queried field by field. Stops
get their own table because the map and the itinerary do filter them by kind.
"""

from __future__ import annotations

import uuid

from django.db import models


class Trip(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    # --- inputs ---
    current_label = models.CharField(max_length=255)
    current_lat = models.FloatField()
    current_lon = models.FloatField()
    pickup_label = models.CharField(max_length=255)
    pickup_lat = models.FloatField()
    pickup_lon = models.FloatField()
    dropoff_label = models.CharField(max_length=255)
    dropoff_lat = models.FloatField()
    dropoff_lon = models.FloatField()
    cycle_used_hours = models.FloatField()
    start_at = models.DateTimeField()

    # --- results ---
    end_at = models.DateTimeField()
    total_miles = models.FloatField()
    total_drive_hours = models.FloatField()
    total_on_duty_hours = models.FloatField()
    cycle_hours_at_end = models.FloatField()
    route_geometry = models.JSONField(default=list)
    legs = models.JSONField(default=list)
    route_is_estimated = models.BooleanField(default=False)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["-created_at"])]

    def __str__(self) -> str:
        return f"{self.current_label} -> {self.pickup_label} -> {self.dropoff_label}"

    @property
    def elapsed_hours(self) -> float:
        return (self.end_at - self.start_at).total_seconds() / 3600.0


class Stop(models.Model):
    class Kind(models.TextChoices):
        START = "start", "Start"
        PICKUP = "pickup", "Pickup"
        DROPOFF = "dropoff", "Dropoff"
        FUEL = "fuel", "Fuel stop"
        BREAK = "break", "30-minute break"
        REST = "rest", "10-hour rest"
        RESTART = "restart", "34-hour restart"

    trip = models.ForeignKey(Trip, related_name="stops", on_delete=models.CASCADE)
    order = models.PositiveIntegerField()
    kind = models.CharField(max_length=16, choices=Kind.choices)
    label = models.CharField(max_length=255)
    activity = models.CharField(max_length=120)
    arrive_at = models.DateTimeField()
    depart_at = models.DateTimeField()
    duration_hours = models.FloatField()
    trip_miles = models.FloatField()
    lat = models.FloatField(null=True, blank=True)
    lon = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ("order",)
        constraints = [
            models.UniqueConstraint(fields=["trip", "order"], name="unique_stop_order_per_trip")
        ]

    def __str__(self) -> str:
        return f"{self.get_kind_display()} @ {self.label}"


class DailyLog(models.Model):
    trip = models.ForeignKey(Trip, related_name="daily_logs", on_delete=models.CASCADE)
    day = models.DateField()
    sheet_number = models.PositiveIntegerField()
    total_sheets = models.PositiveIntegerField()
    miles = models.FloatField()

    off_hours = models.FloatField()
    sleeper_hours = models.FloatField()
    driving_hours = models.FloatField()
    on_duty_hours = models.FloatField()

    segments = models.JSONField(default=list)
    remarks = models.JSONField(default=list)
    recap = models.JSONField(default=dict)

    class Meta:
        ordering = ("sheet_number",)
        constraints = [
            models.UniqueConstraint(fields=["trip", "day"], name="unique_log_day_per_trip")
        ]

    def __str__(self) -> str:
        return f"Sheet {self.sheet_number}/{self.total_sheets} - {self.day}"

    @property
    def total_hours(self) -> float:
        return self.off_hours + self.sleeper_hours + self.driving_hours + self.on_duty_hours


class PlaceCache(models.Model):
    """Reverse-geocode results, keyed by a coarse lat/lon grid.

    Remarks need a city and state at every duty change, which on a long trip
    means a dozen or more reverse lookups. Snapping to a ~3.5 mile grid means
    stops in the same town resolve once, which keeps the request fast and
    stays well inside the provider's rate limit.
    """

    grid_key = models.CharField(max_length=32, unique=True)
    lat = models.FloatField()
    lon = models.FloatField()
    label = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    GRID_DEGREES = 0.05

    class Meta:
        verbose_name_plural = "place cache"

    def __str__(self) -> str:
        return f"{self.grid_key} -> {self.label}"

    @classmethod
    def key_for(cls, lat: float, lon: float) -> str:
        step = cls.GRID_DEGREES
        return f"{round(lat / step) * step:.2f},{round(lon / step) * step:.2f}"
