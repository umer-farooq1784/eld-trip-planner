import { useEffect, useRef } from "react";
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

interface Props {
  open: boolean;
  value: CarrierDetails;
  onChange: (next: CarrierDetails) => void;
  onClose: () => void;
}

export function CarrierDialog({ open, value, onChange, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="carrier-title"
      className="m-0 mt-auto w-full max-w-none rounded-t-xl border border-rule bg-surface p-0
                 text-ink shadow-2xl backdrop:bg-ink/45 sm:m-auto sm:max-w-lg sm:rounded-xl"
    >
      <form method="dialog" className="flex max-h-[85vh] flex-col">
        <header className="flex items-start gap-3 border-b border-rule px-5 py-4">
          <div className="min-w-0">
            <h2 id="carrier-title" className="font-display text-base font-semibold text-ink">
              Log sheet header details
            </h2>
            <p className="mt-0.5 text-xs leading-snug text-ink-mid">
              A record of duty status must name the carrier, its office, the vehicle and the
              driver. Saved in this browser.
            </p>
          </div>
          <button
            type="submit"
            aria-label="Close"
            className="-mr-1 ml-auto shrink-0 rounded p-1.5 text-ink-mute transition
                       hover:bg-sunken hover:text-ink"
          >
            <svg viewBox="0 0 14 14" className="h-4 w-4" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </header>

        <div className="grid gap-3 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          {FIELDS.map(([key, label, placeholder]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-[11px] font-medium text-ink-mid">{label}</span>
              <input
                value={value[key]}
                placeholder={placeholder}
                onChange={(e) => onChange({ ...value, [key]: e.target.value })}
                className="w-full min-w-0 rounded-md border border-rule bg-surface px-2.5 py-2
                           text-sm text-ink placeholder:text-ink-mute/60 focus:border-accent
                           focus:outline-none"
              />
            </label>
          ))}
        </div>

        <footer className="flex items-center gap-3 border-t border-rule px-5 py-3">
          <p className="text-[11px] text-ink-mute">Changes apply to every sheet immediately.</p>
          <button
            type="submit"
            className="ml-auto rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white
                       transition hover:bg-ink/90"
          >
            Done
          </button>
        </footer>
      </form>
    </dialog>
  );
}
