import type { TripPlan } from "../types";
import { PlanTripButton } from "./PlanTripButton";

function Stat({ label, value, unit, tone = "" }: {
  label: string; value: string; unit?: string; tone?: string;
}) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-mute">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-xl font-semibold tabular ${tone || "text-ink"}`}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-ink-mute">{unit}</span>}
      </div>
    </div>
  );
}

export function SummaryBar({
  plan,
  onPlan,
}: {
  plan: TripPlan;
  onPlan: () => void;
}) {
  const s = plan.summary;
  const remaining = s.cycle_hours_remaining;
  const tone = remaining < 8 ? "text-warn" : remaining < 20 ? "text-accent" : "text-good";

  return (
    <div className="rounded-lg border border-rule bg-surface shadow-sm">
      <div className="grid grid-cols-2 divide-x divide-y divide-rule-soft sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
        <Stat label="Distance" value={s.total_miles.toLocaleString()} unit="mi" />
        <Stat label="Driving" value={s.total_drive_hours.toFixed(1)} unit="h" />
        <Stat label="On duty" value={s.total_on_duty_hours.toFixed(1)} unit="h" />
        <Stat label="Elapsed" value={s.elapsed_hours.toFixed(1)} unit="h" />
        <Stat label="Log sheets" value={String(s.sheets)} />
        <Stat label="Cycle left" value={remaining.toFixed(1)} unit="h" tone={tone} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule-soft
                      px-4 py-2 text-xs text-ink-mid">
        <span className="font-semibold text-ink">Stops planned</span>
        <span>{s.rest_stops} × 10-hour rest</span>
        <span>{s.breaks} × 30-min break</span>
        <span>{s.fuel_stops} × fuel</span>
        {s.restarts > 0 && (
          <span className="font-semibold text-warn">{s.restarts} × 34-hour restart</span>
        )}
        <span className="ml-auto rounded bg-good-wash px-2 py-0.5 font-semibold text-good">
          No HOS violations
        </span>
        <PlanTripButton onClick={onPlan} label="New trip" />
      </div>

      {plan.route.is_estimated && (
        <p className="border-t border-rule-soft bg-accent-wash px-4 py-2 text-xs text-accent">
          Distances are straight-line estimates &mdash; no routing API key is configured, so
          mileage and drive times are approximate.
        </p>
      )}
    </div>
  );
}
