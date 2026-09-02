import { useCallback, useEffect, useState } from "react";
import { ApiError, getTrip, listTrips, planTrip, type PlanRequest } from "./api";
import type { TripPlan, TripSummaryRow } from "./types";
import { DEFAULT_CARRIER, loadCarrier, saveCarrier, type CarrierDetails } from "./lib/carrier";
import { TripForm } from "./components/TripForm";
import { CarrierPanel } from "./components/CarrierPanel";
import { SummaryBar } from "./components/SummaryBar";
import { RouteMap } from "./components/RouteMap";
import { Itinerary } from "./components/Itinerary";
import { LogSheets } from "./components/LogSheets";
import { TripHistory } from "./components/TripHistory";

export default function App() {
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [history, setHistory] = useState<TripSummaryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [carrier, setCarrier] = useState<CarrierDetails>(DEFAULT_CARRIER);

  useEffect(() => setCarrier(loadCarrier()), []);

  const updateCarrier = useCallback((next: CarrierDetails) => {
    setCarrier(next);
    saveCarrier(next);
  }, []);

  const refreshHistory = useCallback(() => {
    listTrips().then(setHistory).catch(() => undefined);
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
            className="ml-auto rounded border border-white/20 px-2.5 py-1 text-[11px]
                       text-white/70 transition hover:border-white/50 hover:text-white"
          >
            49 CFR § 395
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-5 px-5 py-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="print:hidden lg:sticky lg:top-5 lg:self-start">
          <div className="rounded-lg border border-rule bg-surface shadow-sm">
            <div className="p-4">
              <TripForm onSubmit={submit} busy={busy} />
            </div>
            <CarrierPanel value={carrier} onChange={updateCarrier} />
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
                <TripHistory trips={history} activeId={plan?.id ?? null} onOpen={open} />
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

          {!busy && !plan && !error && <EmptyState />}

          {plan && (
            <div className="relative">
              {busy && <PlanningOverlay />}
              <div
                className={busy ? "pointer-events-none opacity-40 transition-opacity" : "transition-opacity"}
                aria-busy={busy}
              >
                <div className="space-y-5">
              <SummaryBar plan={plan} />
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_360px] print:hidden">
                <RouteMap plan={plan} />
                <section className="rounded-lg border border-rule bg-surface shadow-sm">
                  <h2 className="border-b border-rule px-4 py-3 font-display text-base font-semibold text-ink">
                    Itinerary
                  </h2>
                  <div className="max-h-[376px] overflow-y-auto px-4">
                    <Itinerary plan={plan} />
                  </div>
                </section>
              </div>
              <LogSheets key={plan.id ?? plan.summary.start_at} plan={plan} carrier={carrier} />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
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

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-rule bg-surface/60 px-6 py-16 text-center">
      <h2 className="font-display text-xl font-semibold text-ink">Plan a compliant trip</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-mid">
        Enter where the driver is, where the load is collected and delivered, and how much of
        the 70-hour cycle is already used. You get a route with every required rest, break and
        fuel stop, plus a drawn log sheet for each day.
      </p>
      <p className="mx-auto mt-4 max-w-md text-xs text-ink-mute">
        Assumes a property-carrying driver on the 70&nbsp;hr / 8&nbsp;day cycle, no adverse
        driving conditions, fuel at least every 1,000&nbsp;miles, and one hour each for pickup
        and dropoff.
      </p>
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
