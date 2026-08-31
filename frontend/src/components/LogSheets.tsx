import { useRef, useState } from "react";
import type { DayLog, TripPlan } from "../types";
import { DUTY_COLOR, DUTY_LABEL } from "../types";
import type { CarrierDetails } from "../lib/carrier";
import { downloadSheetPng } from "../lib/exportSheet";
import { DailyLogSheet } from "./DailyLogSheet";

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });

function DutyLegend({ day }: { day: DayLog }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {(["OFF", "SB", "D", "ON"] as const).map((duty) => (
        <span key={duty} className="flex items-center gap-1.5 text-xs text-ink-mid">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: DUTY_COLOR[duty] }} />
          {DUTY_LABEL[duty]}
          <span className="font-mono font-semibold text-ink tabular">
            {day.totals[duty].toFixed(2)}h
          </span>
        </span>
      ))}
    </div>
  );
}

export function LogSheets({ plan, carrier }: { plan: TripPlan; carrier: CarrierDetails }) {
  const [active, setActive] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sheetRef = useRef<SVGSVGElement>(null);

  const day = plan.days[active];
  if (!day) return null;

  const milesToDate = plan.days
    .slice(0, active + 1)
    .reduce((sum, entry) => sum + entry.miles, 0);

  const exportPng = async () => {
    if (!sheetRef.current) return;
    setExporting(true);
    setError(null);
    try {
      await downloadSheetPng(sheetRef.current, `eld-log-${day.date}.png`);
    } catch {
      setError("Could not save the sheet. Try printing instead.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="rounded-lg border border-rule bg-surface shadow-sm">
      <header className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-3">
        <h2 className="font-display text-base font-semibold text-ink">Daily log sheets</h2>
        <span className="rounded bg-sunken px-2 py-0.5 font-mono text-xs text-ink-mid tabular">
          {plan.days.length} {plan.days.length === 1 ? "sheet" : "sheets"}
        </span>
        <div className="ml-auto flex gap-2 print:hidden">
          <button type="button" onClick={exportPng} disabled={exporting}
            className="rounded-md border border-rule px-3 py-1.5 text-xs font-medium text-ink-mid
                       transition hover:border-accent hover:text-accent disabled:opacity-60">
            {exporting ? "Saving…" : "Download PNG"}
          </button>
          <button type="button" onClick={() => window.print()}
            className="rounded-md border border-rule px-3 py-1.5 text-xs font-medium text-ink-mid
                       transition hover:border-accent hover:text-accent">
            Print all / PDF
          </button>
        </div>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-rule px-4 py-2 print:hidden">
        {plan.days.map((entry, index) => (
          <button
            key={entry.date} type="button" onClick={() => setActive(index)}
            aria-current={index === active}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              index === active
                ? "bg-ink text-white"
                : "text-ink-mid hover:bg-sunken hover:text-ink"
            }`}
          >
            <span className="font-mono tabular">Day {entry.sheet_number}</span>
            <span className="ml-1.5 opacity-75">{shortDate(entry.date)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 print:hidden">
        <DutyLegend day={day} />
        <span className="ml-auto font-mono text-xs text-ink-mute tabular">
          {Math.round(day.miles).toLocaleString()} mi · totals {day.total_hours.toFixed(2)}h
        </span>
      </div>

      {error && (
        <p className="mx-4 mb-3 rounded border border-warn/30 bg-warn-wash px-3 py-2 text-xs text-warn">
          {error}
        </p>
      )}

      <div className="overflow-x-auto px-4 pb-4 print:hidden">
        <div className="min-w-[720px] rounded border border-rule">
          <DailyLogSheet ref={sheetRef} day={day} carrier={carrier} totalMilesToDate={milesToDate} />
        </div>
      </div>

      {/* Printing emits every sheet, one per page. */}
      <div className="hidden print:block">
        {plan.days.map((entry, index) => (
          <div key={entry.date} className="break-after-page">
            <DailyLogSheet
              day={entry}
              carrier={carrier}
              totalMilesToDate={plan.days.slice(0, index + 1).reduce((s, e) => s + e.miles, 0)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
