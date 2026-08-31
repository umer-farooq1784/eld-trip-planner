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
  current: "Dallas, TX",
  pickup: "Houston, TX",
  dropoff: "Atlanta, GA",
  cycle: "12",
};

function localNow() {
  const now = new Date();
  now.setSeconds(0, 0);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
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
  const [startAt, setStartAt] = useState(localNow);
  const [touched, setTouched] = useState(false);

  const cycleValue = Number(cycle);
  const cycleValid = cycle !== "" && Number.isFinite(cycleValue) && cycleValue >= 0 && cycleValue <= 70;
  const filled = [current, pickup, dropoff].every((f) => f.query.trim().length >= 3);
  const ready = filled && cycleValid;

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
    setCurrent({ query: SAMPLE.current, place: null });
    setPickup({ query: SAMPLE.pickup, place: null });
    setDropoff({ query: SAMPLE.dropoff, place: null });
    setCycle(SAMPLE.cycle);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <LocationInput label="Current location" hint="Where the driver is now"
        value={current.query} place={current.place}
        onChange={(query, place) => setCurrent({ query, place })} />
      <LocationInput label="Pickup location" hint="Where the load is collected"
        value={pickup.query} place={pickup.place}
        onChange={(query, place) => setPickup({ query, place })} />
      <LocationInput label="Dropoff location" hint="Where the load is delivered"
        value={dropoff.query} place={dropoff.place}
        onChange={(query, place) => setDropoff({ query, place })} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cycle" className="mb-1 block text-xs font-semibold text-ink">
            Current cycle used
          </label>
          <div className="relative">
            <input
              id="cycle" type="number" min={0} max={70} step={0.25} value={cycle}
              onChange={(e) => setCycle(e.target.value)}
              aria-invalid={touched && !cycleValid}
              className={`w-full rounded-md border bg-surface px-3 py-2 pr-10 font-mono text-sm
                          text-ink tabular focus:outline-none ${
                            touched && !cycleValid
                              ? "border-warn focus:border-warn"
                              : "border-rule focus:border-accent"
                          }`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2
                             text-xs text-ink-mute">hrs</span>
          </div>
          <span className="mt-1 block h-4 text-[11px] text-ink-mute">
            {touched && !cycleValid ? (
              <span className="text-warn">Enter 0 to 70 hours.</span>
            ) : (
              "Of the 70-hour / 8-day limit"
            )}
          </span>
        </div>

        <div>
          <label htmlFor="start" className="mb-1 block text-xs font-semibold text-ink">
            Trip start
          </label>
          <input
            id="start" type="datetime-local" value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="w-full rounded-md border border-rule bg-surface px-3 py-2 font-mono
                       text-sm text-ink tabular focus:border-accent focus:outline-none"
          />
          <span className="mt-1 block h-4 text-[11px] text-ink-mute">Home terminal clock</span>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit" disabled={busy}
          className="flex-1 rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white
                     transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
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
