"""Hours-of-Service simulation engine.

Pure Python: no Django imports, no I/O, no network. Everything in this module
is a function of its arguments, which is what makes it fast to test and cheap
to reason about.

Implements the subset of 49 CFR Part 395 that this assessment scopes in:

    property-carrying driver, 70 hr / 8 day cycle, no adverse driving
    conditions, no short-haul exceptions, no sleeper-berth splitting.

Rule citations refer to FMCSA's *Interstate Truck Driver's Guide to Hours of
Service for Property Carriers* (rev. April 2022), cited as [Guide p.N].
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import Enum

# ---------------------------------------------------------------------------
# Regulatory limits
# ---------------------------------------------------------------------------

MAX_DRIVE_PER_SHIFT = 11.0      # 395.3(a)(3)      [Guide p.6]
MAX_DUTY_WINDOW = 14.0          # 395.3(a)(2)      [Guide p.6]
MAX_DRIVE_BEFORE_BREAK = 8.0    # 395.3(a)(3)(ii)  [Guide p.10]
REQUIRED_BREAK = 0.5            # 395.3(a)(3)(ii)
DAILY_RESET = 10.0              # 395.3(a)(1)      [Guide p.6]
CYCLE_LIMIT_HOURS = 70.0        # 395.3(b)(2)      [Guide p.11]
CYCLE_WINDOW_DAYS = 8
CYCLE_RESTART = 34.0            # 395.3(c)         [Guide p.11]

# ---------------------------------------------------------------------------
# Assessment assumptions (stated in the brief, not federal rules)
# ---------------------------------------------------------------------------

FUEL_INTERVAL_MILES = 1000.0
FUEL_STOP_HOURS = 0.5
PICKUP_HOURS = 1.0
DROPOFF_HOURS = 1.0

# ---------------------------------------------------------------------------
# Numerical guards
# ---------------------------------------------------------------------------

EPS = 1e-9
MIN_DRIVE_CHUNK = 1.0 / 60.0    # never emit a sub-minute driving sliver
MAX_ITERATIONS = 5000
MINUTES_PER_DAY = 1440


class HosError(ValueError):
    """Raised when the trip cannot be simulated."""


class Duty(str, Enum):
    """The four rows of the DOT graph grid, top to bottom. [Guide p.16]"""

    OFF = "OFF"
    SB = "SB"
    DRIVING = "D"
    ON_DUTY = "ON"

    @property
    def row(self) -> int:
        return _DUTY_ROW[self]

    @property
    def label(self) -> str:
        return _DUTY_LABEL[self]


_DUTY_ROW = {Duty.OFF: 0, Duty.SB: 1, Duty.DRIVING: 2, Duty.ON_DUTY: 3}
_DUTY_LABEL = {
    Duty.OFF: "Off Duty",
    Duty.SB: "Sleeper Berth",
    Duty.DRIVING: "Driving",
    Duty.ON_DUTY: "On Duty (not driving)",
}

#: Duty statuses that count toward the 60/70-hour cycle. [Guide p.10]
ON_DUTY_STATUSES = (Duty.DRIVING, Duty.ON_DUTY)


class StopKind(str, Enum):
    """Non-driving events that become markers on the map."""

    START = "start"
    PICKUP = "pickup"
    DROPOFF = "dropoff"
    FUEL = "fuel"
    BREAK = "break"
    REST = "rest"
    RESTART = "restart"


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Leg:
    """One routed leg of the trip, as returned by the routing provider."""

    origin_label: str
    destination_label: str
    distance_miles: float
    duration_hours: float

    @property
    def avg_speed_mph(self) -> float:
        if self.duration_hours <= EPS:
            return 0.0
        return self.distance_miles / self.duration_hours


#: Maps cumulative trip miles to a place name for the Remarks section.
#: Injected so the engine stays free of geocoding concerns. [Guide p.17]
Locator = Callable[[float], str]


def _default_locator(trip_miles: float) -> str:
    return f"Mile {trip_miles:,.0f}"


@dataclass(frozen=True)
class TripInput:
    legs: Sequence[Leg]
    cycle_used_hours: float
    start_at: datetime

    def __post_init__(self) -> None:
        if len(self.legs) != 2:
            raise HosError("Expected exactly two legs: current->pickup and pickup->dropoff.")
        if self.cycle_used_hours < 0:
            raise HosError("Current cycle used hours cannot be negative.")
        if self.cycle_used_hours > CYCLE_LIMIT_HOURS:
            raise HosError(
                f"Current cycle used hours cannot exceed the {CYCLE_LIMIT_HOURS:.0f}-hour limit."
            )
        for leg in self.legs:
            if leg.distance_miles < 0 or leg.duration_hours < 0:
                raise HosError("Leg distance and duration must be non-negative.")


# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------


@dataclass
class Segment:
    """A single continuous period in one duty status."""

    duty: Duty
    start: datetime
    end: datetime
    activity: str
    location: str
    miles: float = 0.0
    kind: StopKind | None = None
    trip_miles_at_start: float = 0.0

    @property
    def hours(self) -> float:
        return (self.end - self.start).total_seconds() / 3600.0


@dataclass
class Remark:
    """A duty-status change, written under the grid as city + state. [Guide p.17]"""

    at: datetime
    minute_of_day: int
    location: str
    activity: str
    duty: Duty


@dataclass
class Recap:
    """The recap box printed at the foot of the DOT log form.

    ``hours_last_7_days`` is column A, ``hours_available_tomorrow`` is column B
    (70 minus A), and ``hours_last_8_days`` is column C. B is 70 minus A rather
    than 70 minus C because tomorrow becomes the eighth day of the rolling
    window. [Guide p.11]
    """

    on_duty_today: float
    hours_last_7_days: float
    hours_available_tomorrow: float
    hours_last_8_days: float


@dataclass
class DailyLog:
    """One calendar day, one printed log sheet."""

    day: date
    sheet_number: int
    total_sheets: int
    segments: list[Segment]
    totals: dict[Duty, float]
    miles: float
    remarks: list[Remark]
    recap: Recap

    @property
    def total_hours(self) -> float:
        return sum(self.totals.values())


@dataclass
class Simulation:
    segments: list[Segment]
    days: list[DailyLog]
    total_miles: float
    total_drive_hours: float
    total_on_duty_hours: float
    cycle_hours_at_start: float
    cycle_hours_at_end: float
    start_at: datetime
    end_at: datetime

    @property
    def elapsed_hours(self) -> float:
        return (self.end_at - self.start_at).total_seconds() / 3600.0

    @property
    def stops(self) -> list[Segment]:
        return [s for s in self.segments if s.kind is not None]


# ---------------------------------------------------------------------------
# The engine
# ---------------------------------------------------------------------------


class HosSimulator:
    """Walks the trip forward in time, obeying five simultaneous clocks.

    Each driving step advances until the *nearest* clock binds, then the engine
    inserts whatever that clock requires and continues. The clocks are:

    ==========================  =======  ==================================
    clock                       limit    reset by
    ==========================  =======  ==================================
    ``drive_in_shift``          11 h     10 consecutive hours off / SB
    ``window_used``             14 h     10 consecutive hours off / SB
    ``drive_since_break``        8 h     any >= 30 consecutive min not driving
    ``cycle_used``              70 h     34 consecutive hours off duty
    ``miles_since_fuel``     1000 mi     a fuel stop
    ==========================  =======  ==================================

    ``window_used`` is *consecutive clock time*, not driving time: breaks, fuel
    stops and the loading hours all burn it. [Guide p.6]
    """

    def __init__(self, trip: TripInput, locator: Locator | None = None) -> None:
        self.trip = trip
        self.locator: Locator = locator or _default_locator

        self.now = trip.start_at
        self.drive_in_shift = 0.0
        self.window_used = 0.0
        self.drive_since_break = 0.0
        self.cycle_used = float(trip.cycle_used_hours)
        self.miles_since_fuel = 0.0
        self.trip_miles = 0.0
        self.segments: list[Segment] = []

    # -- emission ----------------------------------------------------------

    def _emit(
        self,
        duty: Duty,
        hours: float,
        activity: str,
        location: str,
        *,
        miles: float = 0.0,
        kind: StopKind | None = None,
        resets_shift: bool = False,
    ) -> None:
        """Append one segment and advance every clock it affects."""
        if hours <= EPS:
            return

        segment = Segment(
            duty=duty,
            start=self.now,
            end=self.now + timedelta(hours=hours),
            activity=activity,
            location=location,
            miles=miles,
            kind=kind,
            trip_miles_at_start=self.trip_miles,
        )
        self.segments.append(segment)
        self.now = segment.end
        self.trip_miles += miles

        if duty in ON_DUTY_STATUSES:
            self.cycle_used += hours

        if duty is Duty.DRIVING:
            self.drive_in_shift += hours
            self.drive_since_break += hours
            self.miles_since_fuel += miles

        if resets_shift:
            # Ten or more consecutive hours off duty clears every shift-level
            # clock at once. [Guide p.6]
            self.drive_in_shift = 0.0
            self.window_used = 0.0
            self.drive_since_break = 0.0
        else:
            # The window is consecutive clock time, so everything that is not
            # a qualifying rest burns it -- breaks and fuel stops included.
            self.window_used += hours
            if duty is not Duty.DRIVING and hours >= REQUIRED_BREAK - EPS:
                # Any non-driving block of at least 30 consecutive minutes
                # satisfies the break requirement, whether it is taken on
                # duty, off duty or in the sleeper berth. A fuel stop or a
                # loading hour therefore discharges it, and no separate break
                # is owed. [Guide p.10]
                self.drive_since_break = 0.0

    # -- the interventions -------------------------------------------------

    def _take_break(self, location: str) -> None:
        self._emit(
            Duty.OFF, REQUIRED_BREAK, "30-minute rest break", location, kind=StopKind.BREAK
        )

    def _take_fuel(self, location: str) -> None:
        # Fuelling is on-duty time under the definition in 395.2. [Guide p.5]
        self._emit(Duty.ON_DUTY, FUEL_STOP_HOURS, "Fuel stop", location, kind=StopKind.FUEL)
        self.miles_since_fuel = 0.0

    def _take_reset(self, location: str) -> None:
        self._emit(
            Duty.SB,
            DAILY_RESET,
            "10-hour rest",
            location,
            kind=StopKind.REST,
            resets_shift=True,
        )

    def _take_restart(self, location: str) -> None:
        self._emit(
            Duty.OFF,
            CYCLE_RESTART,
            "34-hour restart",
            location,
            kind=StopKind.RESTART,
            resets_shift=True,
        )
        self.cycle_used = 0.0

    # -- driving -----------------------------------------------------------

    def _drive_leg(self, leg: Leg) -> None:
        remaining = leg.duration_hours
        speed = leg.avg_speed_mph
        guard = 0

        while remaining > EPS:
            guard += 1
            if guard > MAX_ITERATIONS:  # pragma: no cover - structural safety net
                raise HosError("Simulation failed to converge; check leg distance and duration.")

            here = self.locator(self.trip_miles)

            # The 70-hour limit bars *driving* only; other work is still
            # permitted, so this is checked here and not before loading.
            # [Guide p.10]
            if self.cycle_used >= CYCLE_LIMIT_HOURS - EPS:
                self._take_restart(here)
                continue

            if (
                MAX_DRIVE_PER_SHIFT - self.drive_in_shift <= MIN_DRIVE_CHUNK
                or MAX_DUTY_WINDOW - self.window_used <= MIN_DRIVE_CHUNK
            ):
                self._take_reset(here)
                continue

            if MAX_DRIVE_BEFORE_BREAK - self.drive_since_break <= MIN_DRIVE_CHUNK:
                self._take_break(here)
                continue

            if speed > EPS and (
                (FUEL_INTERVAL_MILES - self.miles_since_fuel) / speed <= MIN_DRIVE_CHUNK
            ):
                self._take_fuel(here)
                continue

            headrooms = [
                remaining,
                MAX_DRIVE_PER_SHIFT - self.drive_in_shift,
                MAX_DUTY_WINDOW - self.window_used,
                MAX_DRIVE_BEFORE_BREAK - self.drive_since_break,
                CYCLE_LIMIT_HOURS - self.cycle_used,
            ]
            if speed > EPS:
                headrooms.append((FUEL_INTERVAL_MILES - self.miles_since_fuel) / speed)

            chunk = min(headrooms)
            self._emit(Duty.DRIVING, chunk, "Driving", here, miles=chunk * speed)
            remaining -= chunk

    # -- entry point -------------------------------------------------------

    def run(self) -> Simulation:
        legs = list(self.trip.legs)
        origin, pickup, dropoff = (
            legs[0].origin_label,
            legs[0].destination_label,
            legs[1].destination_label,
        )

        # A driver who is already at the cycle limit cannot drive at all until
        # a 34-hour restart is taken. [Guide p.11]
        if self.cycle_used >= CYCLE_LIMIT_HOURS - EPS:
            self._take_restart(origin)

        self._drive_leg(legs[0])
        self._emit(
            Duty.ON_DUTY, PICKUP_HOURS, "Pickup - loading", pickup, kind=StopKind.PICKUP
        )
        self._drive_leg(legs[1])
        self._emit(
            Duty.ON_DUTY, DROPOFF_HOURS, "Dropoff - unloading", dropoff, kind=StopKind.DROPOFF
        )

        if not self.segments:  # pragma: no cover - guarded by TripInput validation
            raise HosError("Trip produced no duty segments.")

        days = build_daily_logs(
            self.segments, cycle_hours_at_start=self.trip.cycle_used_hours
        )

        return Simulation(
            segments=self.segments,
            days=days,
            total_miles=self.trip_miles,
            total_drive_hours=sum(s.hours for s in self.segments if s.duty is Duty.DRIVING),
            total_on_duty_hours=sum(
                s.hours for s in self.segments if s.duty in ON_DUTY_STATUSES
            ),
            cycle_hours_at_start=self.trip.cycle_used_hours,
            cycle_hours_at_end=self.cycle_used,
            start_at=self.segments[0].start,
            end_at=self.segments[-1].end,
        )


def simulate(trip: TripInput, locator: Locator | None = None) -> Simulation:
    """Convenience wrapper around :class:`HosSimulator`."""
    return HosSimulator(trip, locator).run()


# ---------------------------------------------------------------------------
# Timeline -> log sheets
# ---------------------------------------------------------------------------


@dataclass
class _Piece:
    """A segment clipped to a single calendar day."""

    segment: Segment
    completes_source: bool


def _clip_to_days(segments: Sequence[Segment]) -> dict[date, list[_Piece]]:
    """Split segments at midnight, padding the first and last day with Off Duty.

    Every returned day is covered edge to edge, so its four row totals always
    sum to exactly 24 hours -- the invariant a DOT log has to satisfy.
    """
    first, last = segments[0], segments[-1]
    day_start = datetime.combine(first.start.date(), datetime.min.time())
    day_end = datetime.combine(last.end.date(), datetime.min.time()) + timedelta(days=1)

    timeline: list[Segment] = []
    if first.start > day_start:
        timeline.append(
            Segment(
                duty=Duty.OFF,
                start=day_start,
                end=first.start,
                activity="Off duty",
                location=first.location,
            )
        )
    timeline.extend(segments)
    if last.end < day_end:
        timeline.append(
            Segment(
                duty=Duty.OFF,
                start=last.end,
                end=day_end,
                activity="Off duty",
                location=last.location,
            )
        )

    by_day: dict[date, list[_Piece]] = {}
    for source in timeline:
        cursor = source.start
        while cursor < source.end:
            midnight = datetime.combine(cursor.date(), datetime.min.time()) + timedelta(days=1)
            stop = min(source.end, midnight)
            share = (stop - cursor).total_seconds() / max(
                (source.end - source.start).total_seconds(), EPS
            )
            piece = Segment(
                duty=source.duty,
                start=cursor,
                end=stop,
                activity=source.activity,
                location=source.location,
                miles=source.miles * share,
                kind=source.kind,
                trip_miles_at_start=source.trip_miles_at_start,
            )
            by_day.setdefault(cursor.date(), []).append(
                _Piece(segment=piece, completes_source=stop == source.end)
            )
            cursor = stop

    return by_day


def build_daily_logs(
    segments: Sequence[Segment], *, cycle_hours_at_start: float
) -> list[DailyLog]:
    """Turn one absolute timeline into one printable sheet per calendar day."""
    if not segments:
        raise HosError("Cannot build daily logs from an empty timeline.")

    by_day = _clip_to_days(segments)
    ordered_days = sorted(by_day)

    # Pass 1: per-day duty totals and mileage.
    on_duty_by_day: list[float] = []
    for day in ordered_days:
        pieces = by_day[day]
        on_duty_by_day.append(
            sum(p.segment.hours for p in pieces if p.segment.duty in ON_DUTY_STATUSES)
        )

    # Pass 2: the rolling cycle, chronologically, honouring 34-hour restarts.
    cycle_at_end: list[float] = []
    last_restart_index = -1
    running = float(cycle_hours_at_start)
    for index, day in enumerate(ordered_days):
        for piece in by_day[day]:
            if piece.segment.kind is StopKind.RESTART and piece.completes_source:
                running = 0.0
                last_restart_index = index
            elif piece.segment.duty in ON_DUTY_STATUSES:
                running += piece.segment.hours
        cycle_at_end.append(running)

    logs: list[DailyLog] = []
    total_sheets = len(ordered_days)

    for index, day in enumerate(ordered_days):
        pieces = [p.segment for p in by_day[day]]
        pieces.sort(key=lambda s: s.start)

        totals = {duty: 0.0 for duty in Duty}
        for piece in pieces:
            totals[piece.duty] += piece.hours

        midnight = datetime.combine(day, datetime.min.time())
        remarks = [
            Remark(
                at=source.start,
                minute_of_day=round((source.start - midnight).total_seconds() / 60.0),
                location=source.location,
                activity=source.activity,
                duty=source.duty,
            )
            for source in segments
            if source.start.date() == day
        ]

        # Column C is the rolling 8-day total the engine actually enforced.
        # Column A drops the oldest of those eight days, but only when that day
        # is inside the simulated trip and no restart has since cleared the
        # window -- otherwise the two would double-count.
        hours_last_8 = cycle_at_end[index]
        oldest = index - (CYCLE_WINDOW_DAYS - 1)
        if oldest >= 0 and last_restart_index < oldest:
            hours_last_7 = hours_last_8 - on_duty_by_day[oldest]
        else:
            hours_last_7 = hours_last_8

        logs.append(
            DailyLog(
                day=day,
                sheet_number=index + 1,
                total_sheets=total_sheets,
                segments=pieces,
                totals=totals,
                miles=sum(p.miles for p in pieces if p.duty is Duty.DRIVING),
                remarks=remarks,
                recap=Recap(
                    on_duty_today=on_duty_by_day[index],
                    hours_last_7_days=max(0.0, hours_last_7),
                    hours_available_tomorrow=max(0.0, CYCLE_LIMIT_HOURS - hours_last_7),
                    hours_last_8_days=max(0.0, hours_last_8),
                ),
            )
        )

    return logs
