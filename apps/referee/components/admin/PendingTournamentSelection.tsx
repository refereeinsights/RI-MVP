"use client";

import { useEffect } from "react";

export default function PendingTournamentSelection() {
  useEffect(() => {
    const master = document.getElementById("tournament-select-all") as HTMLInputElement | null;
    const summary = document.getElementById("tournament-selection-summary");
    if (!master || !summary) return;
    const boxes = Array.from(
      document.querySelectorAll<HTMLInputElement>(".pending-tournament-checkbox")
    );

    const update = () => {
      const checked = boxes.filter((cb) => cb.checked).length;
      if (!boxes.length) {
        summary.textContent = "No tournaments available";
        master.checked = false;
        master.indeterminate = false;
        return;
      }
      if (checked === 0) {
        summary.textContent = "No tournaments selected";
        master.checked = false;
        master.indeterminate = false;
      } else {
        summary.textContent = `${checked} tournament${checked === 1 ? "" : "s"} selected`;
        master.checked = checked === boxes.length;
        master.indeterminate = checked > 0 && checked < boxes.length;
      }
    };

    const onMasterChange = () => {
      boxes.forEach((cb) => {
        cb.checked = master.checked;
      });
      master.indeterminate = false;
      update();
    };

    master.addEventListener("change", onMasterChange);
    boxes.forEach((cb) => cb.addEventListener("change", update));
    update();

    return () => {
      master.removeEventListener("change", onMasterChange);
      boxes.forEach((cb) => cb.removeEventListener("change", update));
    };
  }, []);

  return null;
}
