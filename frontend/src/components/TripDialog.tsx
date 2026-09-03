import { useEffect, useRef } from "react";
import type { PlanRequest } from "../api";
import { TripForm } from "./TripForm";

interface Props {
  open: boolean;
  onSubmit: (payload: PlanRequest) => void;
  onClose: () => void;
}

export function TripDialog({ open, onSubmit, onClose }: Props) {
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
      aria-labelledby="trip-title"
      className="m-0 mt-auto w-full max-w-none rounded-t-2xl border border-rule bg-surface p-0
                 text-ink shadow-2xl backdrop:bg-ink/50 sm:m-auto sm:max-w-md sm:rounded-xl"
    >
      <div className="flex max-h-[88vh] flex-col">
        <header className="flex items-start gap-3 border-b border-rule px-5 py-4">
          <div className="min-w-0">
            <h2 id="trip-title" className="font-display text-lg font-semibold text-ink">
              Plan a trip
            </h2>
            <p className="mt-0.5 text-xs leading-snug text-ink-mid">
              Property-carrying driver on the 70&nbsp;hr / 8&nbsp;day cycle.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
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

        <div className="overflow-y-auto px-5 py-4">
          <TripForm onSubmit={onSubmit} busy={false} />
        </div>
      </div>
    </dialog>
  );
}
