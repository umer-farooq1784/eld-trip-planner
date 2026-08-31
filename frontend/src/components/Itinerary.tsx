import type { TripPlan } from "../types";
import { STOP_LABEL } from "../types";

const KIND_TONE: Record<string, string> = {
  pickup: "bg-good-wash text-good ring-good/30",
  dropoff: "bg-warn-wash text-warn ring-warn/30",
  fuel: "bg-accent-wash text-accent ring-accent/30",
  break: "bg-sunken text-ink-mid ring-rule",
  rest: "bg-[#efedf9] text-[#5b54a8] ring-[#5b54a8]/25",
  restart: "bg-[#f7ecf4] text-[#7a2f66] ring-[#7a2f66]/25",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString([], {
    weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });

export function Itinerary({ plan }: { plan: TripPlan }) {
  return (
    <ol className="divide-y divide-rule-soft">
      {plan.stops.map((stop) => (
        <li key={stop.order} className="flex items-start gap-3 py-3">
          <span className="w-24 shrink-0 pt-0.5 font-mono text-xs text-ink-mute tabular">
            {when(stop.arrive_at)}
          </span>
          <span
            className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ring-1 ${
              KIND_TONE[stop.kind] ?? "bg-sunken text-ink-mid ring-rule"
            }`}
          >
            {STOP_LABEL[stop.kind]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-ink">{stop.label}</span>
            <span className="font-mono text-xs text-ink-mute tabular">
              {stop.duration_hours}h · mile {Math.round(stop.trip_miles).toLocaleString()}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
