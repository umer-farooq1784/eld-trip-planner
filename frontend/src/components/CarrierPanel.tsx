import { useState } from "react";
import type { CarrierDetails } from "../lib/carrier";

const FIELDS: [keyof CarrierDetails, string, string][] = [
  ["carrier", "Carrier name", "Longhaul Logistics LLC"],
  ["office", "Main office address", "Street, city, state"],
  ["terminal", "Home terminal address", "Street, city, state"],
  ["truck", "Truck / trailer numbers", "Tractor 4187 / Trailer 22910"],
  ["driver", "Driver name", "Name as it appears on the CDL"],
  ["coDriver", "Co-driver", "Full name, or None"],
  ["shipper", "Shipper & commodity", "Shipper name and what is hauled"],
  ["manifest", "DVL / manifest no.", "BOL-449182"],
];

export function CarrierPanel({
  value, onChange,
}: {
  value: CarrierDetails;
  onChange: (next: CarrierDetails) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-rule">
      <button
        type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} log sheet header details`}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-ink">Log sheet header details</span>
        <span className="font-mono text-xs text-ink-mute">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="space-y-2.5 px-4 pb-4">
          <p className="text-[11px] leading-snug text-ink-mute">
            A record of duty status must name the carrier, its office, the vehicle and the
            driver. These are saved in this browser.
          </p>
          {FIELDS.map(([key, label, placeholder]) => (
            <label key={key} className="block">
              <span className="mb-0.5 block text-[11px] text-ink-mid">{label}</span>
              <input
                value={value[key]}
                placeholder={placeholder}
                onChange={(e) => onChange({ ...value, [key]: e.target.value })}
                className="w-full rounded border border-rule bg-surface px-2 py-1.5 text-xs
                           text-ink placeholder:text-ink-mute/60 focus:border-accent
                           focus:outline-none"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
