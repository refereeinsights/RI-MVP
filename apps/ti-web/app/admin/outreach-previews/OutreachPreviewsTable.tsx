"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type PreviewRow = {
  id: string;
  created_at: string;
  sport: string;
  tournament_name: string;
  tournament_start_date?: string | null;
  director_email: string;
  subject: string;
  status: string;
  tournament_id: string | null;
};

type OutreachPreviewsTableProps = {
  previews: PreviewRow[];
  selectedPreviewId: string;
  campaignId: string;
  sport: string;
  suppressionByTournamentId: Record<string, { status: string }>;
  startAfter: string;
};

export default function OutreachPreviewsTable({
  previews,
  selectedPreviewId,
  campaignId,
  sport,
  suppressionByTournamentId,
  startAfter,
}: OutreachPreviewsTableProps) {
  const router = useRouter();
  const [localPreviews, setLocalPreviews] = useState(previews);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setLocalPreviews(previews);
    setSelectedIds([]);
  }, [previews]);

  const allSelected = localPreviews.length > 0 && selectedIds.length === localPreviews.length;
  const selectableIds = useMemo(() => localPreviews.map((preview) => preview.id), [localPreviews]);
  const previewById = useMemo(() => new Map(localPreviews.map((preview) => [preview.id, preview])), [localPreviews]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  }

  function toggleAll() {
    setSelectedIds((prev) => (prev.length === previews.length ? [] : [...selectableIds]));
  }

  async function handleSendSelected() {
    if (selectedIds.length === 0) return;
    setMessage("");

    const response = await fetch("/api/outreach/send-director", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preview_ids: selectedIds }),
    });

    const json = (await response.json().catch(() => ({}))) as {
      sent?: number;
      skipped?: number;
      error?: string;
    };

    if (!response.ok) {
      setMessage(json.error || "Unable to send selected emails.");
      return;
    }

    setMessage(`Sent ${json.sent ?? 0} email${json.sent === 1 ? "" : "s"}; skipped ${json.skipped ?? 0}.`);
    setSelectedIds([]);
    router.refresh();
  }

  async function handleSuppressSelected() {
    if (selectedIds.length === 0) return;
    setMessage("");

    const tasks = selectedIds
      .map((id) => previewById.get(id))
      .filter((preview): preview is PreviewRow => Boolean(preview && preview.tournament_id))
      .map((preview) =>
        fetch("/api/outreach/suppressions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preview_id: preview.id,
            tournament_id: preview.tournament_id,
            sport: preview.sport || sport,
            director_email: preview.director_email,
            reason: "removed",
          }),
        })
      );

    const results = await Promise.all(tasks);
    const failures = results.filter((res) => !res.ok).length;
    const succeeded = results.length - failures;

    if (failures > 0) {
      setMessage(`Suppressed ${succeeded} tournament${succeeded === 1 ? "" : "s"}, ${failures} failed.`);
    } else {
      setMessage(`Suppressed ${succeeded} tournament${succeeded === 1 ? "" : "s"}.`);
    }

    setSelectedIds([]);
    setLocalPreviews((prev) => prev.filter((preview) => !selectedIds.includes(preview.id)));
    router.refresh();
  }

  return (
    <div className="bodyCard" style={{ display: "grid", gap: 12, paddingLeft: 12, paddingRight: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          className="cta ti-home-cta ti-home-cta-secondary"
          onClick={toggleAll}
          disabled={localPreviews.length === 0}
          style={{ opacity: localPreviews.length === 0 ? 0.7 : 1 }}
        >
          {allSelected ? "Clear selection" : "Select all"}
        </button>
        <button
          type="button"
          className="cta ti-home-cta ti-home-cta-primary"
          onClick={() => startTransition(() => void handleSendSelected())}
          disabled={pending || selectedIds.length === 0}
          style={{ opacity: pending || selectedIds.length === 0 ? 0.7 : 1 }}
        >
          Send selected to directors
        </button>
        <button
          type="button"
          className="cta ti-home-cta ti-home-cta-secondary"
          onClick={() => startTransition(() => void handleSuppressSelected())}
          disabled={pending || selectedIds.length === 0}
          style={{ opacity: pending || selectedIds.length === 0 ? 0.7 : 1 }}
        >
          Suppress selected
        </button>
        <span className="muted" style={{ fontSize: 13 }}>
          {selectedIds.length} selected
        </span>
        {message ? (
          <span className="muted" style={{ fontSize: 13 }}>
            {message}
          </span>
        ) : null}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
          <thead>
            <tr>
              {["", "Created", "Starts", "Tournament", "Email", "Status"].map((heading) => (
                <th key={heading} style={thStyle}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {localPreviews.map((preview) => {
              const href = buildPreviewHref(preview.id, campaignId, sport, startAfter);
              const isSelected = selectedPreviewId === preview.id;
              const suppression = preview.tournament_id ? suppressionByTournamentId[preview.tournament_id] : null;
              const startLabel = formatDateOnly(preview.tournament_start_date);
              return (
                <tr key={preview.id} style={{ background: isSelected ? "#eff6ff" : "transparent" }}>
                  <td style={tdStyle}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(preview.id)}
                      onChange={() => toggleSelected(preview.id)}
                    />
                  </td>
                  <td style={tdStyle}>{formatDate(preview.created_at)}</td>
                  <td style={tdStyle}>{startLabel || "TBA"}</td>
                  <td style={tdStyle}>
                    <Link href={href} style={rowLinkStyle}>
                      {preview.tournament_name}
                    </Link>
                    <div className="muted" style={{ marginTop: 4, fontSize: 12, lineHeight: 1.45 }}>
                      {preview.subject}
                    </div>
                  </td>
                  <td style={tdStyle}>{preview.director_email}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <span style={statusPillStyle(preview.status)}>{preview.status}</span>
                      {suppression ? <span style={statusPillStyle(suppression.status)}>{suppression.status}</span> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {localPreviews.length === 0 ? (
              <tr>
                <td style={tdStyle} colSpan={6}>
                  No previews found for the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildPreviewHref(previewId: string, campaignId: string, sport: string, startAfter: string) {
  const url = new URLSearchParams();
  if (campaignId) url.set("campaign_id", campaignId);
  if (sport) url.set("sport", sport);
  if (startAfter) url.set("start_after", startAfter);
  url.set("preview_id", previewId);
  return `/admin/outreach-previews?${url.toString()}`;
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatDateOnly(value?: string | null) {
  if (!value) return "";
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString();
  } catch {
    return value;
  }
}

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #dbe4ec",
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#475569",
};

const tdStyle: CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #e2e8f0",
  verticalAlign: "top",
  fontSize: 14,
};

const rowLinkStyle: CSSProperties = {
  color: "#1d4ed8",
  textDecoration: "none",
  fontWeight: 600,
};

function statusPillStyle(status: string): CSSProperties {
  const normalized = status.trim().toLowerCase();
  if (normalized === "sent") {
    return {
      display: "inline-flex",
      padding: "4px 8px",
      borderRadius: 999,
      background: "#dcfce7",
      color: "#166534",
      fontSize: 12,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
    };
  }
  if (normalized === "error") {
    return {
      display: "inline-flex",
      padding: "4px 8px",
      borderRadius: 999,
      background: "#fee2e2",
      color: "#b91c1c",
      fontSize: 12,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
    };
  }
  return {
    display: "inline-flex",
    padding: "4px 8px",
    borderRadius: 999,
    background: "#dbeafe",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };
}
