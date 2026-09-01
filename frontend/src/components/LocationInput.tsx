import { useEffect, useId, useRef, useState } from "react";
import { geocode } from "../api";
import type { Place } from "../types";

interface Props {
  label: string;
  hint: string;
  value: string;
  place: Place | null;
  onChange: (query: string, place: Place | null) => void;
}

export function LocationInput({ label, hint, value, place, onChange }: Props) {
  const id = useId();
  const [options, setOptions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const skipNextLookup = useRef(false);

  useEffect(() => {
    if (skipNextLookup.current) {
      skipNextLookup.current = false;
      return;
    }
    // Already resolved to a specific place, either by picking a suggestion or
    // by the form filling the field itself. Looking it up again would reopen
    // the list over a field the user is not editing.
    if (place && place.label === value) {
      setOptions([]);
      setOpen(false);
      return;
    }
    if (value.trim().length < 3) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await geocode(value.trim(), controller.signal);
        setOptions(results);
        setHighlight(0);
        setOpen(results.length > 0);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, place]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (option: Place) => {
    skipNextLookup.current = true;
    onChange(option.label, option);
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        value={value}
        placeholder={hint}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onChange={(e) => onChange(e.target.value, null)}
        onFocus={() => options.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !options.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + options.length) % options.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(options[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full rounded-md border border-rule bg-surface px-3 py-2 text-sm text-ink
                   placeholder:text-ink-mute/70 focus:border-accent focus:outline-none"
      />

      <span className="mt-1 block h-4 text-[11px]">
        {loading ? (
          <span className="text-ink-mute">Searching…</span>
        ) : place ? (
          <span className="font-mono text-good tabular">
            ✓ {place.lat.toFixed(3)}, {place.lon.toFixed(3)}
          </span>
        ) : value.trim().length >= 3 ? (
          <span className="text-ink-mute">Pick a suggestion to pin the exact spot</span>
        ) : null}
      </span>

      {open && options.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border
                     border-rule bg-surface py-1 shadow-lg"
        >
          {options.map((option, index) => (
            <li key={`${option.lat},${option.lon},${index}`} role="option"
              aria-selected={index === highlight}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(option)}
                className={`block w-full px-3 py-1.5 text-left text-sm ${
                  index === highlight ? "bg-accent-wash text-ink" : "text-ink-mid"
                }`}
              >
                {option.label}
                <span className="ml-2 font-mono text-[10px] text-ink-mute tabular">
                  {option.lat.toFixed(2)}, {option.lon.toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
