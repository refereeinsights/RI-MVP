"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function SelectAllOnPage(props: { containerId: string; itemSelector?: string }) {
  const itemSelector = useMemo(() => props.itemSelector ?? "input[data-field-maps-item='1']", [props.itemSelector]);
  const checkboxRef = useRef<HTMLInputElement | null>(null);
  const [checked, setChecked] = useState(false);
  const [indeterminate, setIndeterminate] = useState(false);

  const readState = () => {
    const container = document.getElementById(props.containerId);
    if (!container) return { total: 0, selected: 0 };
    const items = Array.from(container.querySelectorAll<HTMLInputElement>(itemSelector));
    const selected = items.filter((i) => i.checked).length;
    return { total: items.length, selected };
  };

  const syncFromDom = () => {
    const { total, selected } = readState();
    setChecked(total > 0 && selected === total);
    setIndeterminate(selected > 0 && selected < total);
  };

  const setAll = (next: boolean) => {
    const container = document.getElementById(props.containerId);
    if (!container) return;
    const items = Array.from(container.querySelectorAll<HTMLInputElement>(itemSelector));
    for (const item of items) {
      if (item.checked === next) continue;
      item.checked = next;
      item.dispatchEvent(new Event("change", { bubbles: true }));
    }
    syncFromDom();
  };

  useEffect(() => {
    const container = document.getElementById(props.containerId);
    if (!container) return;
    const handler = () => syncFromDom();
    container.addEventListener("change", handler);
    syncFromDom();
    return () => container.removeEventListener("change", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.containerId, itemSelector]);

  useEffect(() => {
    if (!checkboxRef.current) return;
    checkboxRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      aria-label="Select all rows on this page"
      checked={checked}
      onChange={(e) => setAll(e.target.checked)}
    />
  );
}

