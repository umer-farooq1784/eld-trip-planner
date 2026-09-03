type Size = "hero" | "bar" | "header";

const STYLES: Record<Size, string> = {
  hero: "px-6 py-3 text-base",
  bar: "px-3.5 py-1.5 text-xs",
  header: "px-3.5 py-1.5 text-xs",
};

export function PlanTripButton({
  onClick,
  size = "bar",
  label = "Plan a trip",
  onDark = false,
}: {
  onClick: () => void;
  size?: Size;
  label?: string;
  onDark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 rounded-md font-semibold shadow-sm
                  transition ${STYLES[size]} ${
                    onDark
                      ? "bg-accent-bright text-ink hover:bg-accent-bright/90"
                      : "bg-ink text-white hover:bg-ink/90"
                  }`}
    >
      <svg viewBox="0 0 14 14" className={size === "hero" ? "h-4 w-4" : "h-3.5 w-3.5"}
        fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
        strokeLinejoin="round" aria-hidden="true">
        <path d="M7 2v10M2 7h10" />
      </svg>
      {label}
    </button>
  );
}
