export function CarrierButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md border border-rule
                 px-2.5 py-1 text-xs font-medium text-ink-mid transition hover:border-accent
                 hover:text-accent"
    >
      <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor"
        strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2.5 3.5h9M2.5 7h9M2.5 10.5h5" />
      </svg>
      Log sheet details
    </button>
  );
}
