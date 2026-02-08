"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AssignorRow = {
  id: string;
  display_name: string | null;
  base_city: string | null;
  base_state: string | null;
  zip?: string | null;
};

type Status = { kind: "idle" | "loading" | "success" | "error"; message?: string };
type ZipMap = Record<string, string[]>;

export default function AssignorZipBackfillList({ rows }: { rows: AssignorRow[] }) {
  const router = useRouter();
  const [statusById, setStatusById] = useState<Record<string, Status>>({});
  const [zipsById, setZipsById] = useState<ZipMap>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const ordered = useMemo(() => rows, [rows]);

  async function handleBulkFetch() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    await Promise.all(ids.map((id) => handleFetch(id)));
  }

  const allSelected = ordered.length > 0 && ordered.every((row) => selectedIds.has(row.id));

  async function handleFetch(assignorId: string) {
    setStatusById((prev) => ({ ...prev, [assignorId]: { kind: "loading" } }));
    try {
      const resp = await fetch("/api/admin/assignors/zip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignor_id: assignorId }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.ok) {
        const message = data?.error ?? "Unable to fetch ZIP.";
        setStatusById((prev) => ({ ...prev, [assignorId]: { kind: "error", message } }));
        return;
      }
      setStatusById((prev) => ({
        ...prev,
        [assignorId]: { kind: "success", message: data?.message ?? "ZIP updated." },
      }));
      if (Array.isArray(data?.zips) && data.zips.length) {
        setZipsById((prev) => ({ ...prev, [assignorId]: data.zips }));
      }
    } catch (err: any) {
      setStatusById((prev) => ({
        ...prev,
        [assignorId]: { kind: "error", message: err?.message ?? "Unable to fetch ZIP." },
      }));
    }
  }

  if (!ordered.length) {
    return <div style={{ color: "#555", fontSize: 13 }}>All assignors have ZIPs.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) => {
              if (event.target.checked) {
                setSelectedIds(new Set(ordered.map((row) => row.id)));
              } else {
                setSelectedIds(new Set());
              }
            }}
          />
          Select all
        </label>
        <button
          type="button"
          onClick={handleBulkFetch}
          disabled={!selectedIds.size}
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontWeight: 800,
            opacity: selectedIds.size ? 1 : 0.6,
            cursor: selectedIds.size ? "pointer" : "default",
          }}
        >
          Fetch ZIPs (Selected)
        </button>
        <button
          type="button"
          onClick={() => router.refresh()}
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid #111",
            background: "#fff",
            color: "#111",
            fontWeight: 800,
          }}
        >
          Refresh List
        </button>
      </div>
      {ordered.map((assignor) => {
        const status = statusById[assignor.id] ?? { kind: "idle" as const };
        const isLoading = status.kind === "loading";
        const zipList = zipsById[assignor.id] ?? [];
        return (
          <div
            key={assignor.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 10,
              padding: 10,
              background: "#fff",
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 800 }}>{assignor.display_name ?? "Unnamed"}</div>
              <div style={{ color: "#555", fontSize: 13 }}>
                {[assignor.base_city, assignor.base_state].filter(Boolean).join(", ") || "—"}
              </div>
              {status.kind !== "idle" ? (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color:
                      status.kind === "success"
                        ? "#166534"
                        : status.kind === "error"
                        ? "#b91c1c"
                        : "#555",
                  }}
                >
                  {status.message ?? (status.kind === "loading" ? "Fetching..." : "")}
                </div>
              ) : null}
              {zipList.length ? (
                <div style={{ marginTop: 4, fontSize: 12, color: "#0f172a" }}>
                  ZIPs: {zipList.join(", ")}
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(assignor.id)}
                  onChange={(event) => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (event.target.checked) next.add(assignor.id);
                      else next.delete(assignor.id);
                      return next;
                    });
                  }}
                />
                Select
              </label>
              <button
                type="button"
                onClick={() => handleFetch(assignor.id)}
                disabled={isLoading || status.kind === "success"}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: status.kind === "success" ? "1px solid #166534" : "1px solid #111",
                  background: status.kind === "success" ? "#16a34a" : "#111",
                  color: "#fff",
                  fontWeight: 800,
                  opacity: isLoading ? 0.6 : 1,
                  cursor: isLoading ? "default" : "pointer",
                }}
              >
                {status.kind === "success" ? "ZIPs Added" : isLoading ? "Fetching..." : "Fetch ZIP"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
