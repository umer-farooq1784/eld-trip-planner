import { useMemo } from "react";
import type { Stop, StopKind, TripPlan } from "../types";
import { STOP_LABEL } from "../types";

const CYCLE_LIMIT = 70;

const KIND: Record<StopKind, { color: string; wash: string; glyph: string }> = {
  start: { color: "#0f1b33", wash: "bg-sunken text-ink ring-rule", glyph: "A" },
  pickup: { color: "#2c6a50", wash: "bg-good-wash text-good ring-good/30", glyph: "P" },
  dropoff: { color: "#9e4023", wash: "bg-warn-wash text-warn ring-warn/30", glyph: "D" },
  fuel: { color: "#b0771a", wash: "bg-accent-wash text-accent ring-accent/30", glyph: "F" },
  break: { color: "#6e7a96", wash: "bg-sunken text-ink-mid ring-rule", glyph: "30" },
  rest: { color: "#5b54a8", wash: "bg-[#efedf9] text-[#5b54a8] ring-[#5b54a8]/25", glyph: "10" },
  restart: { color: "#7a2f66", wash: "bg-[#f7ecf4] text-[#7a2f66] ring-[#7a2f66]/25", glyph: "34" },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString([], {
    weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });

function driveLabel(miles: number, hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const time = h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  return `${Math.round(miles).toLocaleString()} mi · ${time} drive`;
}

function CycleClock({ hours }: { hours: number }) {
  const pct = Math.min(100, (hours / CYCLE_LIMIT) * 100);
  const tone = hours > 62 ? "bg-warn" : hours > 50 ? "bg-accent" : "bg-ink";
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span className="text-[11px] text-ink-mute">Cycle clock</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-[11px] text-ink-mid tabular">
        {hours.toFixed(1)} / {CYCLE_LIMIT}h
      </span>
    </div>
  );
}

export function Itinerary({ plan }: { plan: TripPlan }) {
  const stops = useMemo<Stop[]>(() => {
    const origin: Stop = {
      order: -1,
      kind: "start",
      label: plan.inputs.current.label,
      activity: "Trip start",
      arrive_at: plan.summary.start_at,
      depart_at: plan.summary.start_at,
      duration_hours: 0,
      trip_miles: 0,
      cycle_hours: plan.summary.cycle_hours_at_start,
    };
    return [origin, ...plan.stops];
  }, [plan]);

  const total = plan.summary.total_miles || 1;

  return (
    <div>
      <div className="border-b border-rule-soft px-4 py-3">
        <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] text-ink-mute tabular">
          <span>{when(plan.summary.start_at)}</span>
          <span className="font-sans text-xs font-semibold text-ink">
            {Math.round(plan.summary.total_miles).toLocaleString()} mi total
          </span>
          <span>{when(plan.summary.end_at)}</span>
        </div>
        <div className="relative mt-2 h-1.5 rounded-full bg-ink/85">
          {stops.map((stop) => (
            <span
              key={stop.order}
              title={`${STOP_LABEL[stop.kind]} · ${stop.label}`}
              className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full
                         ring-2 ring-surface"
              style={{
                left: `${Math.min(100, (stop.trip_miles / total) * 100)}%`,
                background: KIND[stop.kind].color,
              }}
            />
          ))}
        </div>
      </div>

      <ol className="max-h-[296px] overflow-y-auto px-4 py-2">
        {stops.map((stop, index) => {
          const next = stops[index + 1];
          const style = KIND[stop.kind];
          return (
            <li key={stop.order} className="relative pb-1 pl-9">
              {next && (
                <span className="absolute left-[13px] top-7 bottom-0 w-px bg-rule" aria-hidden="true" />
              )}
              <span
                className="absolute left-0 top-1 flex h-[26px] w-[26px] items-center justify-center
                           rounded-full font-mono text-[10px] font-semibold text-white"
                style={{ background: style.color }}
                aria-hidden="true"
              >
                {style.glyph}
              </span>

              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono text-xs font-medium text-ink tabular">
                  {when(stop.arrive_at)}
                </span>
                <span className={`ml-auto rounded px-2 py-0.5 text-[11px] font-semibold ring-1 ${style.wash}`}>
                  {STOP_LABEL[stop.kind]}
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm font-semibold text-ink" title={stop.label}>
                {stop.label}
              </p>
              {stop.duration_hours > 0 && (
                <p className="font-mono text-[11px] text-ink-mute tabular">
                  {stop.duration_hours}h here · mile {Math.round(stop.trip_miles).toLocaleString()}
                </p>
              )}
              <CycleClock hours={stop.cycle_hours} />

              {next && (
                <p className="mt-2.5 mb-2.5 flex items-center gap-1.5 font-mono text-[11px] text-ink-mute tabular">
                  <span aria-hidden="true">↓</span>
                  {driveLabel(
                    next.trip_miles - stop.trip_miles,
                    (new Date(next.arrive_at).getTime() - new Date(stop.depart_at).getTime()) / 3600000,
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
