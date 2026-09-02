import { useState } from "react";
import type { PlanRequest } from "../api";
import type { Place } from "../types";
import { LocationInput } from "./LocationInput";

interface Field {
  query: string;
  place: Place | null;
}

const EMPTY: Field = { query: "", place: null };

const SAMPLE = {
  current: { label: "Dallas, TX", lat: 32.7767, lon: -96.797 },
  pickup: { label: "Houston, TX", lat: 29.7604, lon: -95.3698 },
  dropoff: { label: "Atlanta, GA", lat: 33.749, lon: -84.388 },
  cycle: "12",
};

const MAX_CYCLE_HOURS = 70;
const EARLIEST_DAYS_BACK = 8;
const LATEST_DAYS_AHEAD = 30;

function toLocalInput(date: Date) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function shiftDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalInput(d);
}

export function TripForm({
  onSubmit, busy,
}: {
  onSubmit: (payload: PlanRequest) => void;
  busy: boolean;
}) {
  const [current, setCurrent] = useState<Field>(EMPTY);
  const [pickup, setPickup] = useState<Field>(EMPTY);
  const [dropoff, setDropoff] = useState<Field>(EMPTY);
  const [cycle, setCycle] = useState("0");
  const [startAt, setStartAt] = useState(() => toLocalInput(new Date()));
  const [touched, setTouched] = useState(false);

  const earliest = shiftDays(-EARLIEST_DAYS_BACK);
  const latest = shiftDays(LATEST_DAYS_AHEAD);

  const cycleValue = Number(cycle);
  const cycleValid =
    cycle !== "" &&
    Number.isFinite(cycleValue) &&
    cycleValue >= 0 &&
    cycleValue <= MAX_CYCLE_HOURS;
  const cycleProblem =
    cycle === ""
      ? "Enter hours already used."
      : !Number.isFinite(cycleValue)
        ? "Enter a number."
        : cycleValue < 0
          ? "Cannot be negative."
          : cycleValue > MAX_CYCLE_HOURS
            ? `Limit is ${MAX_CYCLE_HOURS} hours.`
            : null;

  const startValid = startAt !== "" && startAt >= earliest && startAt <= latest;
  const startProblem =
    startAt === ""
      ? "Pick when the trip starts."
      : startAt < earliest
        ? `No earlier than ${EARLIEST_DAYS_BACK} days ago.`
        : startAt > latest
          ? `No later than ${LATEST_DAYS_AHEAD} days ahead.`
          : null;

  const filled = [current, pickup, dropoff].every((f) => f.query.trim().length >= 3);
  const ready = filled && cycleValid && startValid;

  const showCycleError = cycleProblem !== null && (touched || cycle !== "");
  const showStartError = startProblem !== null && (touched || startAt !== "");

  // Only block the button on a value that is wrong, not one that is missing:
  // a greyed button with nothing to explain it leaves the user stuck.
  const hasBadValue = (cycle !== "" && !cycleValid) || (startAt !== "" && !startValid);
  const missing = (field: Field) =>
    touched && field.query.trim().length < 3 ? "Enter a location." : null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!ready || busy) return;
    onSubmit({
      current: { query: current.query, lat: current.place?.lat, lon: current.place?.lon },
      pickup: { query: pickup.query, lat: pickup.place?.lat, lon: pickup.place?.lon },
      dropoff: { query: dropoff.query, lat: dropoff.place?.lat, lon: dropoff.place?.lon },
      cycle_used_hours: cycleValue,
      start_at: startAt || null,
    });
  };

  const useSample = () => {
    setCurrent({ query: SAMPLE.current.label, place: SAMPLE.current });
    setPickup({ query: SAMPLE.pickup.label, place: SAMPLE.pickup });
    setDropoff({ query: SAMPLE.dropoff.label, place: SAMPLE.dropoff });
    setCycle(SAMPLE.cycle);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <LocationInput label="Current location" hint="e.g. Dallas, TX"
        value={current.query} place={current.place} error={missing(current)}
        onChange={(query, place) => setCurrent({ query, place })} />
      <LocationInput label="Pickup location" hint="e.g. Houston, TX"
        value={pickup.query} place={pickup.place} error={missing(pickup)}
        onChange={(query, place) => setPickup({ query, place })} />
      <LocationInput label="Dropoff location" hint="e.g. Atlanta, GA"
        value={dropoff.query} place={dropoff.place} error={missing(dropoff)}
        onChange={(query, place) => setDropoff({ query, place })} />

      <div className="space-y-3">
        <div>
          <label htmlFor="cycle" className="mb-1 block text-xs font-semibold text-ink">
            Current cycle used
          </label>
          <div className="relative">
            <input
              id="cycle" type="number" min={0} max={MAX_CYCLE_HOURS} step={0.25} value={cycle}
              inputMode="decimal"
              onChange={(e) => setCycle(e.target.value)}
              aria-invalid={showCycleError}
              aria-describedby="cycle-hint"
              placeholder="0"
              className={`w-full rounded-md border bg-surface px-3 py-2 pr-10 font-mono text-sm
                          text-ink placeholder:text-ink-mute/60 tabular focus:outline-none ${
                            showCycleError
                              ? "border-warn focus:border-warn"
                              : "border-rule focus:border-accent"
                          }`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2
                             text-xs text-ink-mute">hrs</span>
          </div>
          <span id="cycle-hint"
            className="mt-1 block min-h-8 text-[11px] leading-tight text-ink-mute">
            {showCycleError ? (
              <span className="text-warn">{cycleProblem}</span>
            ) : (
              `Of the ${MAX_CYCLE_HOURS}-hour / 8-day limit`
            )}
          </span>
        </div>

        <div>
          <label htmlFor="start" className="mb-1 block text-xs font-semibold text-ink">
            Trip start
          </label>
          <input
            id="start" type="datetime-local" value={startAt}
            min={earliest} max={latest}
            style={{ colorScheme: "light" }}
            onChange={(e) => setStartAt(e.target.value)}
            aria-invalid={showStartError}
            aria-describedby="start-hint"
            className={`w-full rounded-md border bg-surface px-2.5 py-2 font-mono text-[13px]
                        text-ink tabular focus:outline-none ${
                          showStartError
                            ? "border-warn focus:border-warn"
                            : "border-rule focus:border-accent"
                        }`}
          />
          <span id="start-hint"
            className="mt-1 block min-h-8 text-[11px] leading-tight text-ink-mute">
            {showStartError ? (
              <span className="text-warn">{startProblem}</span>
            ) : (
              "Home terminal clock"
            )}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit" disabled={busy || hasBadValue}
          className="flex-1 rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white
                     transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "Planning route…" : "Plan trip & draw logs"}
        </button>
        <button
          type="button" onClick={useSample} disabled={busy}
          className="rounded-md border border-rule px-3 py-2.5 text-xs font-medium text-ink-mid
                     transition hover:border-accent hover:text-accent disabled:opacity-60"
        >
          Sample
        </button>
      </div>
    </form>
  );
}
