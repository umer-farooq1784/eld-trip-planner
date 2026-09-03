export function PlanTripButton({
  onClick,
  label = "Plan a trip",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md bg-ink px-3.5 py-1.5
                 text-xs font-semibold text-white shadow-sm transition hover:bg-ink/90"
    >
      <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 2v10M2 7h10" />
      </svg>
      {label}
    </button>
  );
}
