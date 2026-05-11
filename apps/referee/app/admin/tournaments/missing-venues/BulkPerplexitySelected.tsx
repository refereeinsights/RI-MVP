"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  selector?: string;
};

type RunResult = {
  attempted: number;
  insertedTotal: number;
  skippedAlreadyRan: number;
  errors: number;
};

function getSelectedTournamentIds(selector: string) {
  const nodes = Array.from(document.querySelectorAll<HTMLInputElement>(selector));
  return nodes.filter((n) => n.checked && n.dataset.tournamentId).map((n) => String(n.dataset.tournamentId));
}

function setAllSelected(selector: string, checked: boolean) {
  const nodes = Array.from(document.querySelectorAll<HTMLInputElement>(selector));
  for (const n of nodes) n.checked = checked;
}

export default function BulkPerplexitySelected({ selector = "input[data-mv-select='1']" }: Props) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string>("");

  const label = useMemo(() => {
    return "Find via Perplexity (selected)";
  }, []);

  const run = async () => {
    if (running) return;
    const ids = getSelectedTournamentIds(selector);
    if (ids.length === 0) {
      setStatus("Select one or more tournaments first.");
      return;
    }
    setRunning(true);
    setStatus(`Running Perplexity for ${ids.length} tournament${ids.length === 1 ? "" : "s"}...`);

    const result: RunResult = { attempted: 0, insertedTotal: 0, skippedAlreadyRan: 0, errors: 0 };

    try {
      for (const tournamentId of ids) {
        const node = document.querySelector<HTMLInputElement>(`${selector}[data-tournament-id='${tournamentId}']`);
        const alreadyRan = node?.dataset.perplexityRan === "1";
        if (alreadyRan) {
          result.skippedAlreadyRan += 1;
          continue;
        }

        result.attempted += 1;
        setStatus(`Searching (${result.attempted}/${ids.length})...`);

        const res = await fetch("/api/admin/tournaments/enrichment/venue-perplexity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tournament_id: tournamentId }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.ok) {
          result.errors += 1;
          continue;
        }
        result.insertedTotal += Number(json.inserted ?? 0) || 0;
      }

      const msgParts = [
        `Done.`,
        result.attempted ? `Ran ${result.attempted}.` : null,
        result.skippedAlreadyRan ? `Skipped ${result.skippedAlreadyRan} already-run.` : null,
        `Inserted ${result.insertedTotal} candidate${result.insertedTotal === 1 ? "" : "s"}.`,
        result.errors ? `Errors: ${result.errors}.` : null,
      ].filter(Boolean);
      setStatus(msgParts.join(" "));
      router.refresh();
    } catch (err: any) {
      setStatus(`Error: ${err?.message || "request failed"}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 800, color: "#374151" }}>
        <input
          type="checkbox"
          onChange={(e) => {
            setAllSelected(selector, e.currentTarget.checked);
            setStatus("");
          }}
        />
        Select all (page)
      </label>

      <button
        type="button"
        onClick={() => void run()}
        disabled={running}
        style={{
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #7c3aed",
          background: running ? "#f5f3ff" : "#fff",
          color: "#7c3aed",
          fontWeight: 900,
          cursor: running ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
          fontSize: 13,
        }}
      >
        {running ? "Running..." : label}
      </button>

      {status ? <div style={{ fontSize: 12, color: "#4b5563" }}>{status}</div> : null}
    </div>
  );
}

