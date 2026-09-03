import { useCallback, useEffect, useState } from "react";
import { ApiError, getTrip, listTrips, planTrip, type PlanRequest } from "./api";
import type { DayLog, TripPlan, TripSummaryRow } from "./types";
import { DEFAULT_CARRIER, loadCarrier, saveCarrier, type CarrierDetails } from "./lib/carrier";
import { TripForm } from "./components/TripForm";
import { CarrierDialog } from "./components/CarrierDialog";
import { CarrierButton } from "./components/CarrierButton";
import { SummaryBar } from "./components/SummaryBar";
import { PreviewMap, RouteMap } from "./components/RouteMap";
import { Itinerary } from "./components/Itinerary";
import { LogSheets } from "./components/LogSheets";
import { DailyLogSheet } from "./components/DailyLogSheet";
import { TripHistory } from "./components/TripHistory";

export default function App() {
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [history, setHistory] = useState<TripSummaryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [carrier, setCarrier] = useState<CarrierDetails>(DEFAULT_CARRIER);
  const [carrierOpen, setCarrierOpen] = useState(false);

  useEffect(() => setCarrier(loadCarrier()), []);

  const updateCarrier = useCallback((next: CarrierDetails) => {
    setCarrier(next);
    saveCarrier(next);
  }, []);

  const [historyFailed, setHistoryFailed] = useState(false);

  const refreshHistory = useCallback(() => {
    setHistoryFailed(false);
    listTrips()
      .then(setHistory)
      .catch(() => setHistoryFailed(true));
  }, []);

  useEffect(refreshHistory, [refreshHistory]);

  const submit = async (payload: PlanRequest) => {
    setBusy(true);
    setError(null);
    try {
      const result = await planTrip(payload);
      setPlan(result);
      refreshHistory();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const open = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      setPlan(await getTrip(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load that trip.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="bg-ink text-white print:hidden">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
          <div>
            <h1 className="font-display text-lg font-bold leading-tight">ELD Trip Planner</h1>
            <p className="text-xs text-white/60">
              Hours-of-service routing and DOT daily logs, 70&nbsp;hr / 8&nbsp;day
            </p>
          </div>
          <a
            href="https://www.fmcsa.dot.gov/regulations/hours-of-service"
            target="_blank" rel="noreferrer"
            title="Opens the FMCSA hours-of-service regulations, 49 CFR § 395, on fmcsa.dot.gov"
            className="ml-auto flex items-center gap-1.5 rounded border border-white/20 px-2.5 py-1.5
                       text-[11px] text-white/70 transition hover:border-white/50 hover:text-white"
          >
            <span>
              The rules behind this
              <span className="ml-1 font-mono text-white/50">49 CFR § 395</span>
            </span>
            <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0" aria-hidden="true"
              fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M4.5 1.5h6v6M10.5 1.5 5 7M8 9.5v1h-6.5V4h1" />
            </svg>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-5 px-5 py-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="print:hidden lg:sticky lg:top-5 lg:self-start">
          <div className="rounded-lg border border-rule bg-surface shadow-sm">
            <div className="p-4">
              <TripForm onSubmit={submit} busy={busy} />
            </div>
            <div className="border-t border-rule">
              <div className="flex items-baseline gap-2 border-b border-rule-soft px-4 pb-2 pt-3.5">
                <h2 className="text-sm font-semibold text-ink">Recent trips</h2>
                {history.length > 0 && (
                  <span className="font-mono text-[11px] text-ink-mute tabular">
                    {history.length}
                  </span>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {historyFailed ? (
                  <div className="px-4 py-5 text-center">
                    <p className="text-xs text-ink-mid">Could not load saved trips.</p>
                    <button type="button" onClick={refreshHistory}
                      className="mt-1.5 text-xs font-medium text-accent underline underline-offset-2">
                      Try again
                    </button>
                  </div>
                ) : (
                  <TripHistory trips={history} activeId={plan?.id ?? null} onOpen={open} />
                )}
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          {error && (
            <div role="alert"
              className="rounded-lg border border-warn/30 bg-warn-wash px-4 py-3 text-sm text-warn print:hidden">
              {error}
            </div>
          )}

          {busy && !plan && <Skeleton />}

          {!busy && !plan && (
            <EmptyState carrier={carrier} onEditCarrier={() => setCarrierOpen(true)} />
          )}

          {plan && (
            <div className="relative">
              {busy && <PlanningOverlay />}
              <div
                className={busy ? "pointer-events-none opacity-40 transition-opacity" : "transition-opacity"}
                aria-busy={busy}
              >
                <div className="space-y-5">
              <SummaryBar plan={plan} onEditCarrier={() => setCarrierOpen(true)} />
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_360px] print:hidden">
                <RouteMap plan={plan} />
                <section className="flex flex-col overflow-hidden rounded-lg border border-rule
                                    bg-surface shadow-sm xl:h-[440px]">
                  <div className="border-b border-rule px-4 py-3">
                    <h2 className="font-display text-base font-semibold text-ink">Itinerary</h2>
                    <p className="mt-0.5 truncate text-xs text-ink-mid">
                      {plan.inputs.current.label} → {plan.inputs.dropoff.label} ·{" "}
                      {Math.round(plan.summary.total_miles).toLocaleString()} mi
                    </p>
                  </div>
                  <Itinerary plan={plan} />
                </section>
              </div>
              <LogSheets key={plan.id ?? plan.summary.start_at} plan={plan} carrier={carrier} />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <CarrierDialog
        open={carrierOpen}
        value={carrier}
        onChange={updateCarrier}
        onClose={() => setCarrierOpen(false)}
      />
    </div>
  );
}
function PlanningOverlay() {
  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center pt-24 print:hidden"
    >
      <div className="sticky top-32 flex items-center gap-3 rounded-lg border border-rule
                      bg-surface px-4 py-3 shadow-lg">
        <Spinner />
        <span className="text-sm font-medium text-ink">Planning route&hellip;</span>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin text-accent" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3"
            strokeLinecap="round" />
    </svg>
  );
}

const PREVIEW_STATS: [string, string][] = [
  ["Distance", "mi"], ["Driving", "h"], ["On duty", "h"],
  ["Elapsed", "h"], ["Log sheets", ""], ["Cycle left", "h"],
];

const BLANK_DAY: DayLog = {
  date: new Date().toISOString().slice(0, 10),
  sheet_number: 1,
  total_sheets: 1,
  miles: 0,
  totals: { OFF: 0, SB: 0, D: 0, ON: 0 },
  total_hours: 0,
  segments: [],
  remarks: [],
  recap: {
    on_duty_today: 0,
    hours_last_7_days: 0,
    hours_available_tomorrow: 70,
    hours_last_8_days: 0,
  },
};

function EmptyState({
  carrier,
  onEditCarrier,
}: {
  carrier: CarrierDetails;
  onEditCarrier: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-rule bg-surface shadow-sm">
        <div className="grid grid-cols-2 divide-x divide-y divide-rule-soft sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          {PREVIEW_STATS.map(([label, unit]) => (
            <div key={label} className="px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-mute">
                {label}
              </div>
              <div className="mt-0.5 font-mono text-xl font-semibold text-ink-mute/50 tabular">
                &mdash;
                {unit && <span className="ml-1 text-xs font-normal">{unit}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule-soft px-4 py-2">
          <p className="text-xs text-ink-mid">
            Enter a trip on the left. Every required rest, 30-minute break and fuel stop is
            placed for you, on the 70&nbsp;hr / 8&nbsp;day cycle.
          </p>
          <CarrierButton onClick={onEditCarrier} />
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <PreviewMap caption="Your route and stops appear here" />
        <section className="rounded-lg border border-rule bg-surface shadow-sm">
          <h2 className="border-b border-rule px-4 py-3 font-display text-base font-semibold text-ink">
            Itinerary
          </h2>
          <div className="flex h-[376px] flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm text-ink-mid">Plan a trip to see the stops.</p>
            <p className="max-w-[26ch] text-xs leading-relaxed text-ink-mute">
              Each pickup, rest, break and fuel stop listed in order with its arrival time
              and mile marker.
            </p>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border border-rule bg-surface shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-3">
          <h2 className="font-display text-base font-semibold text-ink">Daily log sheets</h2>
          <span className="rounded bg-sunken px-2 py-0.5 font-mono text-xs text-ink-mid tabular">
            one per day
          </span>
          <span className="ml-auto text-xs text-ink-mute">
            Drawn on the DOT form, ready to print
          </span>
        </div>
        <div className="relative overflow-x-auto px-4 pb-4 pt-4">
          <div className="pointer-events-none min-w-[720px] select-none rounded border border-rule opacity-45">
            <DailyLogSheet day={BLANK_DAY} carrier={carrier} />
          </div>
        </div>
      </section>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Planning the trip">
      <div className="flex items-center gap-3 rounded-lg border border-rule bg-surface px-4 py-3">
        <Spinner />
        <span className="text-sm font-medium text-ink">Planning route&hellip;</span>
      </div>
      <div className="h-[92px] animate-pulse rounded-lg border border-rule bg-surface" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="h-[440px] animate-pulse rounded-lg border border-rule bg-surface" />
        <div className="h-[440px] animate-pulse rounded-lg border border-rule bg-surface" />
      </div>
      <div className="h-[520px] animate-pulse rounded-lg border border-rule bg-surface" />
    </div>
  );
}
