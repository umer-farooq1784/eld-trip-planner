"""Replace stored trips with a set that exercises each branch of the engine."""

from __future__ import annotations

from datetime import datetime, timedelta

from django.core.management.base import BaseCommand

from trips.models import DailyLog, Stop, Trip
from trips.services.planner import PlaceInput, plan_trip

SCENARIOS: list[tuple[str, str, str, str, float, int]] = [
    # label, current, pickup, dropoff, cycle used, days from today
    ("Regional run, no rest required",
     "Dallas, TX", "Houston, TX", "San Antonio, TX", 0.0, 1),
    ("One overnight rest",
     "Chicago, IL", "Indianapolis, IN", "Atlanta, GA", 14.0, 2),
    ("Break owed after eight hours of driving",
     "Denver, CO", "Kansas City, MO", "Columbus, OH", 8.0, 3),
    ("Fuel stop past the first thousand miles",
     "Denver, CO", "Salt Lake City, UT", "Portland, OR", 22.0, 4),
    ("Cross country, several sheets",
     "Los Angeles, CA", "Phoenix, AZ", "New York, NY", 10.0, 5),
    ("Cycle runs out mid-trip, 34-hour restart",
     "Laredo, TX", "San Antonio, TX", "Chicago, IL", 62.0, 6),
    ("At the cycle limit before turning a wheel",
     "Memphis, TN", "Nashville, TN", "Baltimore, MD", 70.0, 7),
]


class Command(BaseCommand):
    help = "Delete stored trips and replace them with the demo scenarios."

    def add_arguments(self, parser):
        parser.add_argument(
            "--keep-existing", action="store_true",
            help="Add the scenarios without deleting what is already stored.",
        )

    def handle(self, *args, **options):
        if not options["keep_existing"]:
            removed = Trip.objects.count()
            Trip.objects.all().delete()
            self.stdout.write(f"Removed {removed} stored trips.")

        base = datetime.now().replace(hour=6, minute=0, second=0, microsecond=0)

        for label, current, pickup, dropoff, cycle, offset in SCENARIOS:
            payload = plan_trip(
                current=PlaceInput(current),
                pickup=PlaceInput(pickup),
                dropoff=PlaceInput(dropoff),
                cycle_used_hours=cycle,
                start_at=base + timedelta(days=offset),
            )
            summary = payload["summary"]
            self.stdout.write(
                f"  {label}\n"
                f"    {current} -> {pickup} -> {dropoff}  cycle {cycle:g}h\n"
                f"    {summary['total_miles']:,.0f} mi | drive {summary['total_drive_hours']}h | "
                f"{summary['sheets']} sheets | rest {summary['rest_stops']} "
                f"break {summary['breaks']} fuel {summary['fuel_stops']} "
                f"restart {summary['restarts']}"
            )

        self.stdout.write(self.style.SUCCESS(
            f"\n{Trip.objects.count()} trips, {Stop.objects.count()} stops, "
            f"{DailyLog.objects.count()} log sheets."
        ))
