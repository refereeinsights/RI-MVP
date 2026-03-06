import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireTiOutreachAdmin } from "@/lib/outreachAdmin";
import { getOutreachMode } from "@/lib/outreach";
import AutoSubmitInput from "@/components/filters/AutoSubmitInput";
import AutoSubmitSelect from "@/components/filters/AutoSubmitSelect";
import CopyFieldButton from "./CopyFieldButton";
import GeneratePreviewsForm from "./GeneratePreviewsForm";
import OutreachPreviewsTable from "./OutreachPreviewsTable";
import PreviewAdminActions from "./PreviewAdminActions";

type SearchParams = {
  campaign_id?: string;
  sport?: string;
  preview_id?: string;
  start_after?: string;
};

type PreviewRow = {
  id: string;
  created_at: string;
  sport: string;
  campaign_id: string;
  tournament_id: string | null;
  tournament_name: string;
  tournament_start_date?: string | null;
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

type OutreachCountRow = {
  id: string;
  tournament_director_email: string | null;
};

type PreviewStatusRow = {
  tournament_id: string;
  status: string;
};

type TournamentDateRow = {
  id: string;
  start_date: string | null;
};

export const dynamic = "force-dynamic";

export default async function OutreachPreviewsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const user = await requireTiOutreachAdmin();

  const campaignId = searchParams?.campaign_id?.trim() || "";
  const sport = normalizeOutreachSport(searchParams?.sport);
  const selectedId = searchParams?.preview_id?.trim() || "";
  const startAfter = normalizeDateParam(searchParams?.start_after);
  const defaultMode = getOutreachMode();
  const todayIso = new Date().toISOString().slice(0, 10);

  const { count: staffVerifiedTodayCount, error: staffVerifiedError } = await (supabaseAdmin.from(
    "tournaments" as any
  ) as any)
    .select("id", { count: "exact", head: true })
    .gte("tournament_staff_verified_at", todayIso);

  if (staffVerifiedError) {
    throw new Error(staffVerifiedError.message);
  }

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

  let previews = (data ?? []) as PreviewRow[];
  let selectedPreview = previews.find((preview) => preview.id === selectedId) ?? previews[0] ?? null;
  const campaignOptions = Array.from(new Set(previews.map((preview) => preview.campaign_id)));
  let tournamentIds = Array.from(new Set(previews.map((preview) => preview.tournament_id).filter(Boolean))) as string[];

  if (tournamentIds.length > 0) {
    const { data: tournamentRowsRaw, error: tournamentError } = await (supabaseAdmin.from("tournaments" as any) as any)
      .select("id,start_date")
      .in("id", tournamentIds);

    if (tournamentError) {
      throw new Error(tournamentError.message);
    }

    const tournamentRows = (tournamentRowsRaw ?? []) as TournamentDateRow[];
    const startDateById = new Map(tournamentRows.map((row) => [row.id, row.start_date]));
    previews = previews.map((preview) => ({
      ...preview,
      tournament_start_date: preview.tournament_id ? startDateById.get(preview.tournament_id) ?? null : null,
    }));

    if (startAfter) {
      const allowedIds = new Set(
        tournamentRows
          .filter((row) => row.start_date && row.start_date >= startAfter)
          .map((row) => row.id)
          .filter(Boolean)
      );
      previews = previews.filter((preview) => (preview.tournament_id ? allowedIds.has(preview.tournament_id) : false));
    }

    selectedPreview = previews.find((preview) => preview.id === selectedId) ?? previews[0] ?? null;
    tournamentIds = Array.from(new Set(previews.map((preview) => preview.tournament_id).filter(Boolean))) as string[];
  }

  const eligibleCount = sport ? await countEligibleOutreachBySport(sport, startAfter) : null;

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

  const suppressionByTournamentId = Object.fromEntries(
    Array.from(suppressionMap.entries()).map(([id, row]) => [id, { status: row.status }])
  );

  return (
    <main className="page" style={{ justifyContent: "flex-start", paddingLeft: 12, paddingRight: 12 }}>
      <div className="shell" style={{ maxWidth: 1560, marginLeft: 0, marginRight: 0 }}>
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
              <AutoSubmitSelect name="sport" defaultValue={sport} style={inputStyle}>
                <option value="">All sports</option>
                {OUTREACH_SPORTS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </AutoSubmitSelect>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Start after</span>
              <AutoSubmitInput
                type="date"
                name="start_after"
                defaultValue={startAfter}
                style={{ ...inputStyle, minWidth: 180 }}
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
          </form>

          <GeneratePreviewsForm
            initialCampaignId={campaignId}
            initialSport={sport || "soccer"}
            initialStartAfter={startAfter}
          />
          <p className="muted" style={{ margin: 0 }}>
            Default mode: <strong>{defaultMode}</strong>
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Staff verified today: {staffVerifiedTodayCount ?? 0}
          </p>
          {eligibleCount !== null ? (
            <p className="muted" style={{ margin: 0 }}>
              {eligibleCount} director email{eligibleCount === 1 ? "" : "s"} available for outreach
            </p>
          ) : null}
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: selectedPreview ? "minmax(820px, 1.6fr) minmax(340px, 0.7fr)" : "1fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          <OutreachPreviewsTable
            previews={previews}
            selectedPreviewId={selectedPreview?.id ?? ""}
            campaignId={campaignId}
            sport={sport}
            suppressionByTournamentId={suppressionByTournamentId}
            startAfter={startAfter}
          />

          {selectedPreview ? (
            <div className="bodyCard" style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gap: 8 }}>
                <h2 style={{ margin: 0 }}>{selectedPreview.tournament_name}</h2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
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

const OUTREACH_SPORTS = ["soccer", "baseball", "softball"] as const;
type OutreachSport = (typeof OUTREACH_SPORTS)[number];

function normalizeOutreachSport(value?: string) {
  const normalized = (value || "").trim().toLowerCase();
  if (OUTREACH_SPORTS.includes(normalized as OutreachSport)) return normalized;
  return "";
}

function normalizeDateParam(value?: string) {
  const normalized = (value || "").trim();
  if (!normalized) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, mm, dd, yyyy] = slashMatch;
    const month = String(mm).padStart(2, "0");
    const day = String(dd).padStart(2, "0");
    return `${yyyy}-${month}-${day}`;
  }
  return "";
}

function isValidDirectorEmail(value: string | null | undefined) {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  const invalid = new Set(["null", "none", "n/a", "na", "unknown", "tbd", "-"]);
  if (invalid.has(trimmed)) return false;
  return /.+@.+\..+/.test(trimmed);
}

async function countEligibleOutreachBySport(sport: string, startAfter: string) {
  const batchSize = 800;
  let offset = 0;
  let scanCount = 0;
  const tournamentIds: string[] = [];

  while (scanCount < 50) {
    scanCount += 1;
    const from = offset;
    const to = offset + batchSize - 1;

    const { data, error } = await (supabaseAdmin.from("tournaments" as any) as any)
      .select("id,tournament_director_email")
      .eq("sport", sport)
      .not("tournament_director_email", "is", null)
      .neq("tournament_director_email", "")
      .gte("start_date", startAfter || "0001-01-01")
      .order("start_date", { ascending: true, nullsFirst: false })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as OutreachCountRow[];
    if (rows.length === 0) break;
    offset += rows.length;

    for (const row of rows) {
      if (!row.id || !isValidDirectorEmail(row.tournament_director_email)) continue;
      tournamentIds.push(row.id);
    }
  }

  if (tournamentIds.length === 0) return 0;

  const suppressionIds = new Set<string>();
  const sentIds = new Set<string>();

  for (let i = 0; i < tournamentIds.length; i += 800) {
    const slice = tournamentIds.slice(i, i + 800);
    const { data: suppressionData, error: suppressionError } = await (supabaseAdmin.from(
      "email_outreach_suppressions" as any
    ) as any)
      .select("tournament_id")
      .in("tournament_id", slice);

    if (suppressionError) {
      throw new Error(suppressionError.message);
    }

    for (const row of (suppressionData ?? []) as SuppressionRow[]) {
      if (row.tournament_id) suppressionIds.add(row.tournament_id);
    }

    const { data: sentData, error: sentError } = await (supabaseAdmin.from("email_outreach_previews" as any) as any)
      .select("tournament_id,status")
      .in("tournament_id", slice)
      .eq("status", "sent");

    if (sentError) {
      throw new Error(sentError.message);
    }

    for (const row of (sentData ?? []) as PreviewStatusRow[]) {
      if (row.tournament_id) sentIds.add(row.tournament_id);
    }
  }

  let eligible = 0;
  for (const id of tournamentIds) {
    if (suppressionIds.has(id)) continue;
    if (sentIds.has(id)) continue;
    eligible += 1;
  }

  return eligible;
}

const inputStyle: CSSProperties = {
  minWidth: 240,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "10px 12px",
  font: "inherit",
};

const smallLinkStyle: CSSProperties = {
  color: "#1d4ed8",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 13,
};

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
