"""Accuracy tests for the Hours-of-Service engine.

Test 8 is the important one: it re-derives compliance from the emitted
timeline with a checker written independently of the engine, so a bug in the
engine's own bookkeeping cannot hide behind itself.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from trips.services import hos
from trips.services.hos import (
    CYCLE_LIMIT_HOURS,
    Duty,
    HosError,
    Leg,
    StopKind,
    TripInput,
    simulate,
)

TOL = 1e-6
START = datetime(2026, 9, 1, 6, 0)

# The legal limits, written out as literals on purpose.
#
# The checker below must NOT import these from the module it is checking. If it
# did, a mutation that loosened a limit in the engine would loosen the
# assertion along with it, and the test would keep passing while the app
# started producing illegal logs. (Verified: raising MAX_DRIVE_PER_SHIFT to 12
# used to leave all tests green.)
LIMIT_DRIVE_PER_SHIFT = 11.0    # 395.3(a)(3)
LIMIT_DUTY_WINDOW = 14.0        # 395.3(a)(2)
LIMIT_DRIVE_BEFORE_BREAK = 8.0  # 395.3(a)(3)(ii)
LIMIT_CYCLE = 70.0              # 395.3(b)(2)
MIN_BREAK = 0.5
MIN_DAILY_RESET = 10.0
MIN_CYCLE_RESTART = 34.0


def build(leg1: tuple[float, float], leg2: tuple[float, float], cycle: float = 0.0):
    """Two legs given as (miles, hours)."""
    return TripInput(
        legs=[
            Leg("Origin City, TX", "Pickup City, TX", leg1[0], leg1[1]),
            Leg("Pickup City, TX", "Dropoff City, GA", leg2[0], leg2[1]),
        ],
        cycle_used_hours=cycle,
        start_at=START,
    )


def duties(sim, duty):
    return [s for s in sim.segments if s.duty is duty]


def kinds(sim, kind):
    return [s for s in sim.segments if s.kind is kind]


# ---------------------------------------------------------------------------
# The independent compliance checker used by test 8
# ---------------------------------------------------------------------------


def assert_compliant(sim):
    """Replay the timeline and re-check every limit from scratch."""
    drive_in_shift = window = drive_since_break = 0.0
    cycle = sim.cycle_hours_at_start
    previous_end = None

    for seg in sim.segments:
        assert seg.end > seg.start, f"non-positive duration: {seg.activity}"
        if previous_end is not None:
            assert seg.start == previous_end, f"gap or overlap before {seg.activity}"
        previous_end = seg.end

        if seg.duty is Duty.DRIVING:
            assert drive_in_shift + seg.hours <= LIMIT_DRIVE_PER_SHIFT + TOL, (
                f"11-hour driving limit exceeded at {seg.start}"
            )
            assert window + seg.hours <= LIMIT_DUTY_WINDOW + TOL, (
                f"14-hour driving window exceeded at {seg.start}"
            )
            assert drive_since_break + seg.hours <= LIMIT_DRIVE_BEFORE_BREAK + TOL, (
                f"drove past 8 cumulative hours without a break at {seg.start}"
            )
            assert cycle + seg.hours <= LIMIT_CYCLE + TOL, (
                f"70-hour cycle exceeded while driving at {seg.start}"
            )
            drive_in_shift += seg.hours
            drive_since_break += seg.hours
            window += seg.hours
            cycle += seg.hours
        else:
            qualifies_as_reset = (
                seg.duty in (Duty.OFF, Duty.SB) and seg.hours >= MIN_DAILY_RESET - TOL
            )
            if qualifies_as_reset:
                drive_in_shift = window = drive_since_break = 0.0
                if seg.hours >= MIN_CYCLE_RESTART - TOL:
                    cycle = 0.0
            else:
                window += seg.hours
                if seg.hours >= MIN_BREAK - TOL:
                    drive_since_break = 0.0
                if seg.duty is Duty.ON_DUTY:
                    cycle += seg.hours


def assert_sheets_well_formed(sim):
    """Every sheet must cover exactly 24 hours, edge to edge."""
    for log in sim.days:
        assert log.total_hours == pytest.approx(24.0, abs=1e-6), (
            f"sheet {log.sheet_number} totals {log.total_hours}h, not 24h"
        )
        minutes = sum((s.end - s.start).total_seconds() / 60 for s in log.segments)
        assert minutes == pytest.approx(1440.0, abs=1e-3)

        cursor = datetime.combine(log.day, datetime.min.time())
        for seg in log.segments:
            assert seg.start == cursor, f"sheet {log.sheet_number} has a hole at {cursor}"
            cursor = seg.end
        assert cursor == datetime.combine(log.day, datetime.min.time()) + timedelta(days=1)

        for remark in log.remarks:
            assert 0 <= remark.minute_of_day < 1440

    assert [d.sheet_number for d in sim.days] == list(range(1, len(sim.days) + 1))
    assert all(d.total_sheets == len(sim.days) for d in sim.days)
    assert sum(d.miles for d in sim.days) == pytest.approx(sim.total_miles, rel=1e-6)


# ---------------------------------------------------------------------------
# 1-7: behavioural cases
# ---------------------------------------------------------------------------


def test_01_short_trip_needs_no_rest_or_break():
    sim = simulate(build((120, 2.0), (180, 3.0)))

    assert len(sim.days) == 1
    assert kinds(sim, StopKind.REST) == []
    assert kinds(sim, StopKind.BREAK) == []
    assert kinds(sim, StopKind.FUEL) == []
    assert sim.total_drive_hours == pytest.approx(5.0)
    # 5 h driving + 2 h loading, starting 06:00 -> off duty again at 13:00.
    assert sim.end_at == datetime(2026, 9, 1, 13, 0)
    assert sim.days[0].totals[Duty.DRIVING] == pytest.approx(5.0)
    assert sim.days[0].totals[Duty.ON_DUTY] == pytest.approx(2.0)
    assert sim.days[0].totals[Duty.OFF] == pytest.approx(17.0)


def test_02_forces_exactly_one_ten_hour_reset():
    # 13 h of driving cannot fit in one 11-hour shift.
    sim = simulate(build((240, 4.0), (540, 9.0)))

    rests = kinds(sim, StopKind.REST)
    assert len(rests) == 1
    assert rests[0].duty is Duty.SB
    assert rests[0].hours == pytest.approx(hos.DAILY_RESET)
    assert len(sim.days) == 2

    # The shift clocks are clear immediately after the rest.
    after = sim.segments[sim.segments.index(rests[0]) + 1]
    assert after.duty is Duty.DRIVING


def test_03_break_lands_at_eight_cumulative_driving_hours():
    # One 8.5 h leg, no interruption before it, so the break is owed at 8 h.
    sim = simulate(build((480, 8.5), (60, 1.0)))

    breaks = kinds(sim, StopKind.BREAK)
    assert len(breaks) == 1
    assert breaks[0].duty is Duty.OFF
    assert breaks[0].hours == pytest.approx(hos.REQUIRED_BREAK)

    driven_before = sum(
        s.hours for s in sim.segments[: sim.segments.index(breaks[0])] if s.duty is Duty.DRIVING
    )
    assert driven_before == pytest.approx(hos.MAX_DRIVE_BEFORE_BREAK)
    assert breaks[0].start == START + timedelta(hours=8)


def test_04_fuel_stop_appears_and_discharges_the_break():
    """Guide p.10: a 30-minute fuel stop satisfies the break requirement.

    The engine must not then insert a redundant break straight afterwards.
    """
    sim = simulate(build((600, 10.0), (600, 10.0)))

    fuels = kinds(sim, StopKind.FUEL)
    assert len(fuels) == 1
    assert fuels[0].duty is Duty.ON_DUTY

    miles_before = fuels[0].trip_miles_at_start
    assert miles_before == pytest.approx(hos.FUEL_INTERVAL_MILES, abs=0.5)

    index = sim.segments.index(fuels[0])
    following = sim.segments[index + 1 :]
    driving_after = 0.0
    for seg in following:
        if seg.duty is Duty.DRIVING:
            driving_after += seg.hours
        elif seg.kind is StopKind.BREAK:
            assert driving_after >= hos.MAX_DRIVE_BEFORE_BREAK - TOL, (
                "redundant break inserted after a qualifying fuel stop"
            )
            break


def test_05_cycle_restart_when_seventy_hours_would_be_crossed():
    sim = simulate(build((300, 5.0), (420, 7.0), cycle=68.0))

    restarts = kinds(sim, StopKind.RESTART)
    assert len(restarts) == 1
    assert restarts[0].duty is Duty.OFF
    assert restarts[0].hours == pytest.approx(hos.CYCLE_RESTART)

    # It is taken mid-trip, only once the 70th hour is actually reached.
    driven_before = sum(
        s.hours
        for s in sim.segments[: sim.segments.index(restarts[0])]
        if s.duty in hos.ON_DUTY_STATUSES
    )
    assert driven_before == pytest.approx(CYCLE_LIMIT_HOURS - 68.0)


def test_06_driver_at_the_cycle_limit_restarts_before_driving_at_all():
    sim = simulate(build((300, 5.0), (300, 5.0), cycle=70.0))

    assert sim.segments[0].kind is StopKind.RESTART
    assert sim.segments[0].start == START
    assert sim.segments[1].duty is Duty.DRIVING
    assert sim.cycle_hours_at_end == pytest.approx(5.0 + 5.0 + 2.0)


def test_07_cross_country_produces_a_stack_of_sheets():
    # Los Angeles -> Phoenix -> New York, roughly 2,500 miles.
    sim = simulate(build((373, 5.8), (2145, 32.0), cycle=10.0))

    assert sim.total_miles == pytest.approx(2518.0)
    assert sim.total_drive_hours == pytest.approx(37.8)
    assert 4 <= len(sim.days) <= 8, f"expected 4-8 sheets, got {len(sim.days)}"
    assert len(kinds(sim, StopKind.FUEL)) == 2  # 2,518 miles crosses 1,000 twice
    assert len(kinds(sim, StopKind.REST)) >= 3
    assert sim.days[-1].day > sim.days[0].day


# ---------------------------------------------------------------------------
# 8: the property test
# ---------------------------------------------------------------------------

FIXTURES = {
    "short": build((120, 2.0), (180, 3.0)),
    "one_reset": build((240, 4.0), (540, 9.0)),
    "break_at_eight": build((480, 8.5), (60, 1.0)),
    "fuel": build((600, 10.0), (600, 10.0)),
    "restart_midtrip": build((300, 5.0), (420, 7.0), cycle=68.0),
    "restart_upfront": build((300, 5.0), (300, 5.0), cycle=70.0),
    "cross_country": build((373, 5.8), (2145, 32.0), cycle=10.0),
    "cycle_heavy": build((900, 15.0), (1800, 29.0), cycle=45.0),
    "zero_first_leg": build((0, 0.0), (400, 6.5)),
    "slow_urban": build((60, 3.0), (90, 4.5), cycle=30.0),
}


@pytest.mark.parametrize("name", sorted(FIXTURES))
def test_08_invariants_hold_for_every_fixture(name):
    sim = simulate(FIXTURES[name])
    assert_compliant(sim)
    assert_sheets_well_formed(sim)

    assert sim.total_drive_hours == pytest.approx(
        sum(leg.duration_hours for leg in FIXTURES[name].legs)
    )
    assert sim.total_miles == pytest.approx(
        sum(leg.distance_miles for leg in FIXTURES[name].legs)
    )
    assert sim.segments[-1].kind is StopKind.DROPOFF


# ---------------------------------------------------------------------------
# 9: the recap box and remarks
# ---------------------------------------------------------------------------


def test_09_recap_columns_are_internally_consistent():
    sim = simulate(build((600, 10.0), (900, 14.0), cycle=20.0))

    running = 20.0
    for log in sim.days:
        running += log.recap.on_duty_today
        assert log.recap.hours_last_8_days == pytest.approx(running, abs=1e-6)
        assert log.recap.hours_available_tomorrow == pytest.approx(
            max(0.0, CYCLE_LIMIT_HOURS - log.recap.hours_last_7_days)
        )
        assert log.recap.hours_last_7_days <= log.recap.hours_last_8_days + TOL

    assert sim.cycle_hours_at_end == pytest.approx(running, abs=1e-6)


def test_remarks_record_every_duty_change_with_a_location():
    sim = simulate(build((600, 10.0), (600, 10.0)))

    all_remarks = [r for log in sim.days for r in log.remarks]
    assert len(all_remarks) == len(sim.segments)
    assert all(r.location for r in all_remarks)
    assert [r.at for r in all_remarks] == [s.start for s in sim.segments]


def test_locator_is_used_for_remark_place_names():
    sim = simulate(
        build((600, 10.0), (600, 10.0)),
        locator=lambda miles: f"US-287 mile {miles:.0f}, Amarillo, TX",
    )
    assert any("Amarillo, TX" in s.location for s in sim.segments)


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "cycle,message",
    [(-1.0, "negative"), (71.0, "cannot exceed")],
)
def test_rejects_out_of_range_cycle_hours(cycle, message):
    with pytest.raises(HosError, match=message):
        build((100, 2.0), (100, 2.0), cycle=cycle)


def test_rejects_wrong_number_of_legs():
    with pytest.raises(HosError, match="exactly two legs"):
        TripInput(legs=[Leg("A", "B", 10, 1)], cycle_used_hours=0, start_at=START)


# ---------------------------------------------------------------------------
# The 14-hour window, exercised deliberately
# ---------------------------------------------------------------------------


def test_14_hour_window_binds_before_the_driving_limit(monkeypatch):
    """The 14-hour window is consecutive clock time, not driving time.

    Under the brief's own assumptions this clock never strictly binds: the most
    non-driving time one shift can accumulate is exactly three hours (1 h
    pickup, 1 h dropoff, a 30-minute break, a 30-minute fuel stop), so 11 hours
    of driving always reaches its wall first or at the very same instant. A
    broken window rule would therefore sail through every realistic fixture.

    Lengthening the loading hour is enough to make the window unambiguously the
    binding clock, which is what this test does.
    """
    monkeypatch.setattr(hos, "PICKUP_HOURS", 5.0)
    sim = simulate(build((60, 1.0), (900, 15.0)))

    rests = kinds(sim, StopKind.REST)
    assert rests, "expected the window to force a rest"
    first_rest = rests[0]

    # 06:00 start + 1 h driving + 5 h loading + 8 h driving = 14 h exactly.
    assert first_rest.start - START == timedelta(hours=LIMIT_DUTY_WINDOW)

    driven_first_shift = sum(
        s.hours
        for s in sim.segments[: sim.segments.index(first_rest)]
        if s.duty is Duty.DRIVING
    )
    assert driven_first_shift == pytest.approx(9.0)
    assert driven_first_shift < LIMIT_DRIVE_PER_SHIFT, (
        "the window, not the 11-hour driving limit, should have stopped the driver"
    )

    assert_compliant(sim)
    assert_sheets_well_formed(sim)


def test_window_is_not_reset_by_a_short_break(monkeypatch):
    """Only 10+ consecutive hours off resets the window; a 30-minute break does not."""
    monkeypatch.setattr(hos, "PICKUP_HOURS", 3.0)
    sim = simulate(build((60, 1.0), (900, 15.0)))

    first_rest = kinds(sim, StopKind.REST)[0]
    index = sim.segments.index(first_rest)

    # A break is taken inside this shift, and the shift still ends at 14 hours.
    assert any(s.kind is StopKind.BREAK for s in sim.segments[:index])
    span = (first_rest.start - START).total_seconds() / 3600.0
    assert span == pytest.approx(LIMIT_DUTY_WINDOW)

    assert_compliant(sim)


def test_no_shift_ever_exceeds_fourteen_hours_of_clock_time():
    """Walk every fixture and re-derive shift spans from wall-clock times."""
    for name, trip in sorted(FIXTURES.items()):
        sim = simulate(trip)
        shift_started = None
        for seg in sim.segments:
            is_reset = seg.duty in (Duty.OFF, Duty.SB) and seg.hours >= MIN_DAILY_RESET - TOL
            if is_reset:
                shift_started = None
                continue
            if shift_started is None:
                shift_started = seg.start
            if seg.duty is Duty.DRIVING:
                span = (seg.end - shift_started).total_seconds() / 3600.0
                assert span <= LIMIT_DUTY_WINDOW + TOL, (
                    f"{name}: drove {span:.2f} h into the shift, past the 14-hour window"
                )


def test_ten_hour_rest_clears_the_break_clock(monkeypatch):
    """After a full rest the driver gets a fresh 8 hours before the next break.

    Carrying a stale break clock across a rest is *legal* -- it only ever
    inserts breaks earlier than required -- so the upper-bound checker above
    cannot see it. It still stretches the trip and puts the break in the wrong
    place on the log sheet, so it is asserted explicitly here.

    Fuelling is pushed out of range so this isolates the break rule; a fuel
    stop would otherwise discharge the break clock on its own.
    """
    monkeypatch.setattr(hos, "FUEL_INTERVAL_MILES", 100_000.0)
    sim = simulate(build((600, 10.0), (900, 15.0)))

    rest = kinds(sim, StopKind.REST)[0]
    driven_since_rest = 0.0

    for seg in sim.segments[sim.segments.index(rest) + 1 :]:
        if seg.duty is Duty.DRIVING:
            driven_since_rest += seg.hours
        elif seg.kind is StopKind.BREAK:
            assert driven_since_rest == pytest.approx(LIMIT_DRIVE_BEFORE_BREAK), (
                f"break came after {driven_since_rest:.2f} h of post-rest driving, "
                f"expected a full {LIMIT_DRIVE_BEFORE_BREAK:.0f} h"
            )
            return

    pytest.fail("expected a 30-minute break in the shift after the rest")
