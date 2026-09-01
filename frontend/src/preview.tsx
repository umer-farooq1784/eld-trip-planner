/** Dev harness: every log sheet for one trip, full width, no app chrome. */
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { DailyLogSheet } from "./components/DailyLogSheet";
import { DEFAULT_CARRIER } from "./lib/carrier";
import { planTrip } from "./api";
import type { TripPlan } from "./types";

const CARRIER = { ...DEFAULT_CARRIER, driver: "M. Farooq", manifest: "BOL-449182" };

function Preview() {
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    planTrip({
      current: { query: "Dallas, TX", lat: 32.7767, lon: -96.797 },
      pickup: { query: "Houston, TX", lat: 29.7604, lon: -95.3698 },
      dropoff: { query: "Atlanta, GA", lat: 33.749, lon: -84.388 },
      cycle_used_hours: 12,
      start_at: "2026-09-01T06:00:00",
    })
      .then(setPlan)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <pre style={{ padding: 24, color: "#9e4023" }}>{error}</pre>;
  if (!plan) return <p style={{ padding: 24 }}>Planning…</p>;

  return (
    <div style={{ padding: 16, display: "grid", gap: 24, background: "#e8ecf2" }}>
      {plan.days.map((day, index) => (
        <div key={day.date} style={{ border: "1px solid #c9d0da", background: "#fff" }}>
          <DailyLogSheet
            day={day}
            carrier={CARRIER}
            totalMilesToDate={plan.days.slice(0, index + 1).reduce((s, e) => s + e.miles, 0)}
          />
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
