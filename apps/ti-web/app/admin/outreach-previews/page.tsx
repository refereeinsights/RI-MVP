import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireTiOutreachAdmin } from "@/lib/outreachAdmin";
import CopyFieldButton from "./CopyFieldButton";
import GeneratePreviewsForm from "./GeneratePreviewsForm";
import PreviewAdminActions from "./PreviewAdminActions";

type SearchParams = {
  campaign_id?: string;
  sport?: string;
  preview_id?: string;
};

type PreviewRow = {
  id: string;
  created_at: string;
  sport: string;
  campaign_id: string;
  tournament_id: string | null;
  tournament_name: string;
  director_email: string;
  verify_url: string;
  subject: string;
  html_body: string;
  text_body: string;
  variant: string | null;
  provider_message_id: string | null;
  status: string;
  error: string | null;
};

type SuppressionRow = {
  tournament_id: string;
  reason: string | null;
  status: string;
};

export const dynamic = "force-dynamic";

export default async function OutreachPreviewsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const user = await requireTiOutreachAdmin();

  const campaignId = searchParams?.campaign_id?.trim() || "";
  const sport = searchParams?.sport?.trim().toLowerCase() || "";
  const selectedId = searchParams?.preview_id?.trim() || "";

  let query = (supabaseAdmin.from("email_outreach_previews" as any) as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (sport) query = query.eq("sport", sport);

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const previews = (data ?? []) as PreviewRow[];
  const selectedPreview = previews.find((preview) => preview.id === selectedId) ?? previews[0] ?? null;
  const campaignOptions = Array.from(new Set(previews.map((preview) => preview.campaign_id)));
  const sportOptions = Array.from(new Set(previews.map((preview) => preview.sport)));
  const tournamentIds = Array.from(new Set(previews.map((preview) => preview.tournament_id).filter(Boolean))) as string[];

  let suppressionMap = new Map<string, SuppressionRow>();
  if (tournamentIds.length > 0) {
    const { data: suppressionData, error: suppressionError } = await (supabaseAdmin.from(
      "email_outreach_suppressions" as any
    ) as any)
      .select("tournament_id,reason,status")
      .in("tournament_id", tournamentIds);

    if (suppressionError) {
      throw new Error(suppressionError.message);
    }

    suppressionMap = new Map(
      ((suppressionData ?? []) as SuppressionRow[]).map((row) => [row.tournament_id, row])
    );
  }

  return (
    <main className="page">
      <div className="shell" style={{ maxWidth: 1120 }}>
        <section className="bodyCard" style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <h1 style={{ margin: 0 }}>Outreach Previews</h1>
            <p className="muted" style={{ margin: 0 }}>
              Review preview-mode tournament director emails without sending anything.
            </p>
          </div>

          <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Campaign</span>
              <input
                type="text"
                name="campaign_id"
                defaultValue={campaignId}
                list="campaign-options"
                placeholder="soccer_verify_round1_2026-03-03"
                style={inputStyle}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Sport</span>
              <input
                type="text"
                name="sport"
                defaultValue={sport}
                list="sport-options"
                placeholder="soccer"
                style={inputStyle}
              />
            </label>
            <button type="submit" className="cta ti-home-cta ti-home-cta-primary">
              Apply filters
            </button>
            <Link href="/admin/outreach-previews" className="cta ti-home-cta ti-home-cta-secondary">
              Clear
            </Link>
            <datalist id="campaign-options">
              {campaignOptions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            <datalist id="sport-options">
              {sportOptions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </form>

          <GeneratePreviewsForm initialCampaignId={campaignId} initialSport={sport || "soccer"} />
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: selectedPreview ? "minmax(320px, 0.78fr) minmax(0, 1.22fr)" : "1fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div className="bodyCard" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr>
                  {["Created", "Tournament", "Email", "Status"].map((heading) => (
                    <th key={heading} style={thStyle}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previews.map((preview) => {
                  const href = buildPreviewHref(preview.id, campaignId, sport);
                  const isSelected = selectedPreview?.id === preview.id;
                  const suppression = preview.tournament_id ? suppressionMap.get(preview.tournament_id) : null;
                  return (
                    <tr key={preview.id} style={{ background: isSelected ? "#eff6ff" : "transparent" }}>
                      <td style={tdStyle}>{formatDate(preview.created_at)}</td>
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
                          {suppression ? (
                            <span style={statusPillStyle(suppression.status)}>{suppression.status}</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {previews.length === 0 ? (
                  <tr>
                    <td style={tdStyle} colSpan={4}>
                      No previews found for the current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {selectedPreview ? (
            <div className="bodyCard" style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gap: 8 }}>
                <h2 style={{ margin: 0 }}>{selectedPreview.tournament_name}</h2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 10,
                  }}
                >
                  <InfoCard label="Email" value={selectedPreview.director_email} />
                  <InfoCard label="Campaign" value={selectedPreview.campaign_id} />
                  <InfoCard label="Variant" value={selectedPreview.variant || "NA"} />
                  <InfoCard label="Status" value={selectedPreview.status} />
                  <InfoCard
                    label="Verify URL"
                    value={
                      <a href={selectedPreview.verify_url} target="_blank" rel="noreferrer" style={smallLinkStyle}>
                        Open verify link
                      </a>
                    }
                  />
                  {selectedPreview.provider_message_id ? (
                    <InfoCard label="Provider message id" value={selectedPreview.provider_message_id} />
                  ) : null}
                </div>
                {selectedPreview.error ? (
                  <p
                    style={{
                      margin: 0,
                      color: "#b91c1c",
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: 10,
                      padding: "10px 12px",
                      fontSize: 14,
                    }}
                  >
                    {selectedPreview.error}
                  </p>
                ) : null}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <CopyFieldButton label="Copy subject" value={selectedPreview.subject} />
                <CopyFieldButton label="Copy verify URL" value={selectedPreview.verify_url} />
                <CopyFieldButton label="Copy HTML" value={selectedPreview.html_body} />
              </div>

              <PreviewAdminActions
                previewId={selectedPreview.id}
                tournamentId={selectedPreview.tournament_id}
                previewLabel={selectedPreview.tournament_name}
                campaignId={campaignId || selectedPreview.campaign_id}
                sport={sport || selectedPreview.sport}
                directorEmail={selectedPreview.director_email}
                defaultTestEmail={user.email || ""}
                isSuppressed={!!(selectedPreview.tournament_id && suppressionMap.get(selectedPreview.tournament_id))}
              />

              <section style={{ display: "grid", gap: 8 }}>
                <h3 style={{ margin: 0 }}>HTML preview</h3>
                <iframe
                  title="Outreach HTML preview"
                  sandbox=""
                  srcDoc={selectedPreview.html_body}
                  style={{
                    width: "100%",
                    minHeight: 340,
                    border: "1px solid #dbe4ec",
                    borderRadius: 12,
                    background: "#ffffff",
                  }}
                />
              </section>

              <section style={{ display: "grid", gap: 8 }}>
                <h3 style={{ margin: 0 }}>Plain text</h3>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    margin: 0,
                    padding: 16,
                    borderRadius: 12,
                    border: "1px solid #dbe4ec",
                    background: "#f8fafc",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 13,
                    lineHeight: 1.55,
                  }}
                >
                  {selectedPreview.text_body}
                </pre>
              </section>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function buildPreviewHref(previewId: string, campaignId: string, sport: string) {
  const url = new URLSearchParams();
  if (campaignId) url.set("campaign_id", campaignId);
  if (sport) url.set("sport", sport);
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

const inputStyle: CSSProperties = {
  minWidth: 240,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "10px 12px",
  font: "inherit",
};

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

const smallLinkStyle: CSSProperties = {
  color: "#1d4ed8",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 13,
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

function InfoCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 4,
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #dbe4ec",
        background: "#f8fafc",
      }}
    >
      <span
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#64748b",
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <div style={{ fontSize: 14, color: "#0f172a", lineHeight: 1.45 }}>{value}</div>
    </div>
  );
}
