"use client";

import { useId, useState } from "react";

export default function RollForwardLogBulkControls({ formId }: { formId: string }) {
  const inputId = useId();
  const [allChecked, setAllChecked] = useState(false);

  function setVisibleSelection(nextChecked: boolean) {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const checkboxes = form.querySelectorAll<HTMLInputElement>('input[name="log_ids"]');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = nextChecked;
    });
    setAllChecked(nextChecked);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <label htmlFor={inputId} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700 }}>
        <input
          id={inputId}
          type="checkbox"
          checked={allChecked}
          onChange={(event) => setVisibleSelection(event.currentTarget.checked)}
        />
        Select all visible
      </label>
      <button
        type="button"
        onClick={() => setVisibleSelection(false)}
        style={{
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #ccc",
          background: "#fff",
          color: "#111",
          fontWeight: 700,
        }}
      >
        Clear selection
      </button>
    </div>
  );
}
