"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  disabled: boolean;
  summaryLabel: string;
  options: { value: string; label: string }[];
  selections: string[];
  onToggle?: (city: string, checked: boolean) => void;
};

export default function CityMultiSelect({
  disabled,
  summaryLabel,
  options,
  selections,
  onToggle,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (disabled) return;
    const handleClick = (event: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [disabled]);

  return (
    <div className="stateDropdown" ref={wrapperRef}>
      <button
        type="button"
        className="stateSummary"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        style={disabled ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
      >
        {summaryLabel}
      </button>
      {!disabled ? (
        <div className={`stateMenu ${open ? "stateMenu--open" : ""}`}>
          {options.map((city) => (
            <label key={city.value} className="sportToggle">
              <input
                type="checkbox"
                name="city"
                value={city.value}
                checked={selections.includes(city.value)}
                onChange={(event) => onToggle?.(city.value, event.target.checked)}
              />
              <span>{city.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
