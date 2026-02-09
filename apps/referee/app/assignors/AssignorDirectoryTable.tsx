"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AssignorContactCells from "./AssignorContactCells";
import { normalizeStateAbbr } from "@/lib/usStates";

type AssignorRow = {
  id: string;
  display_name: string | null;
  base_city: string | null;
  base_state: string | null;
  last_seen_at: string | null;
  confidence: number | null;
  masked_email?: string | null;
  masked_phone?: string | null;
};

type AssignorDirectoryTableProps = {
  assignors: AssignorRow[];
  sportsByAssignor: Record<string, string[]>;
  canReveal: boolean;
  needsTerms: boolean;
  showSignIn: boolean;
};

type RevealMap = Record<string, { email: string | null; phone: string | null }>;

function normalizeCityLabel(value?: string | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  return trimmed
    .toLowerCase()
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

export default function AssignorDirectoryTable({
  assignors,
  sportsByAssignor,
  canReveal,
  needsTerms,
  showSignIn,
}: AssignorDirectoryTableProps) {
  const [revealed, setRevealed] = useState<RevealMap>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const assignorIds = useMemo(() => assignors.map((row) => row.id), [assignors]);

  const handleReveal = async (assignorId: string) => {
    const resp = await fetch("/api/assignors/reveal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assignor_id: assignorId }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || "Unable to reveal contact details.");
    }

    const data = (await resp.json()) as { email: string | null; phone: string | null };
    setRevealed((prev) => ({
      ...prev,
      [assignorId]: { email: data?.email ?? null, phone: data?.phone ?? null },
    }));
  };

  const handleRevealAll = async () => {
    setBulkLoading(true);
    setBulkError(null);
    try {
      const resp = await fetch("/api/assignors/reveal-bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignor_ids: assignorIds }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || "Unable to reveal all contacts.");
      }
      const data = (await resp.json()) as RevealMap;
      setRevealed((prev) => ({ ...prev, ...data }));
    } catch (err: any) {
      setBulkError(err?.message ?? "Unable to reveal all contacts.");
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff" }}>
      {canReveal ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleRevealAll}
            disabled={bulkLoading || assignors.length === 0}
            className="btn"
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              background: "#0f172a",
              color: "#fff",
              border: "1px solid #0f172a",
              opacity: bulkLoading ? 0.7 : 1,
            }}
          >
            {bulkLoading ? "Revealing..." : "Reveal all on this page"}
          </button>
          {bulkError ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{bulkError}</div> : null}
        </div>
      ) : null}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {["Name", "Email", "Phone", "Location", "Sports"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #eee" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {assignors.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: 8, color: "#666" }}>
                No assignors found.
              </td>
            </tr>
          ) : (
            assignors.map((assignor) => {
              const sports = sportsByAssignor[assignor.id] ?? [];
              const revealedRow = revealed[assignor.id];
              return (
                <tr key={assignor.id}>
                  <td style={{ padding: "6px 4px", fontWeight: 700 }}>
                    {assignor.display_name ?? "Unnamed"}
                  </td>
                  <AssignorContactCells
                    assignorId={assignor.id}
                    maskedEmail={assignor.masked_email}
                    maskedPhone={assignor.masked_phone}
                    canReveal={canReveal}
                    needsTerms={needsTerms}
                    showSignIn={showSignIn}
                    revealedEmail={revealedRow?.email ?? null}
                    revealedPhone={revealedRow?.phone ?? null}
                    onReveal={handleReveal}
                  />
                  <td style={{ padding: "6px 4px" }}>
                    {[normalizeCityLabel(assignor.base_city), normalizeStateAbbr(assignor.base_state)]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td style={{ padding: "6px 4px" }}>{sports.length ? sports.join(", ") : "—"}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
