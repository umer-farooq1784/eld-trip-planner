import type { TripSummaryRow } from "../types";

export function TripHistory({
  trips, activeId, onOpen,
}: {
  trips: TripSummaryRow[];
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  if (!trips.length) {
    return (
      <p className="px-4 py-6 text-center text-xs text-ink-mute">
        Planned trips are saved here so you can reopen them.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-rule-soft">
      {trips.map((trip) => (
        <li key={trip.id}>
          <button
            type="button" onClick={() => onOpen(trip.id)}
            aria-current={trip.id === activeId}
            className={`block w-full px-4 py-2.5 text-left transition ${
              trip.id === activeId ? "bg-accent-wash" : "hover:bg-sunken"
            }`}
          >
            <span className="block truncate text-xs font-medium text-ink">
              {trip.current_label} → {trip.dropoff_label}
            </span>
            <span className="font-mono text-[11px] text-ink-mute tabular">
              {Math.round(trip.total_miles).toLocaleString()} mi ·{" "}
              {trip.sheets} {trip.sheets === 1 ? "sheet" : "sheets"} ·{" "}
              {new Date(trip.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
