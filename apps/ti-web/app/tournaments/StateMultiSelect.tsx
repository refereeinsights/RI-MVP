"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  availableStates: string[];
  stateSelections: string[];
  isAllStates: boolean;
  allStatesValue: string;
  summaryLabel: string;
  stateCounts?: Record<string, number>;
  totalCount?: number;
};

export default function StateMultiSelect({
  availableStates,
  stateSelections,
  isAllStates,
  allStatesValue,
  summaryLabel,
  stateCounts = {},
  totalCount,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
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
  }, []);

  return (
    <div className="stateDropdown" ref={wrapperRef}>
      <button
        type="button"
        className="stateSummary"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {summaryLabel}
      </button>
      <div className={`stateMenu ${open ? "stateMenu--open" : ""}`}>
        <label className="sportToggle">
          <input
            type="checkbox"
            name="state"
            value={allStatesValue}
            defaultChecked={isAllStates}
          />
          <span>{`All states${typeof totalCount === "number" ? ` (${totalCount})` : ""}`}</span>
        </label>
        {availableStates.map((st) => (
          <label key={st} className="sportToggle">
            <input
              type="checkbox"
              name="state"
              value={st}
              defaultChecked={stateSelections.includes(st)}
            />
            <span>{`${st}${typeof stateCounts[st] === "number" ? ` (${stateCounts[st]})` : ""}`}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
