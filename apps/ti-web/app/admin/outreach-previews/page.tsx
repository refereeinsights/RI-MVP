import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireTiOutreachAdmin } from "@/lib/outreachAdmin";
import { getOutreachMode } from "@/lib/outreach";
import { TI_SPORT_LABELS, TI_SPORTS, type TiSport } from "@/lib/tiSports";
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
  director_email?: string;
  tournament_q?: string;
};

type PreviewRow = {
  id: string;
  created_at: string;
  sent_at?: string | null;
  send_attempt_count?: number | null;
  director_replied_at?: string | null;
  sport: string;
  campaign_id: string;
  tournament_id: string | null;
  tournament_ids?: string[] | null;
  tournament_name: string;
  tournament_start_date?: string | null;
  director_email: string;
  verify_url: string;
  subject: string;
  html_body?: string;
  text_body?: string;
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
  const returnParams = new URLSearchParams();
  if (searchParams?.campaign_id) returnParams.set("campaign_id", searchParams.campaign_id);
  if (searchParams?.sport) returnParams.set("sport", searchParams.sport);
  if (searchParams?.preview_id) returnParams.set("preview_id", searchParams.preview_id);
  if (searchParams?.start_after) returnParams.set("start_after", searchParams.start_after);
  if (searchParams?.director_email) returnParams.set("director_email", searchParams.director_email);
  if (searchParams?.tournament_q) returnParams.set("tournament_q", searchParams.tournament_q);
  const returnTo = `/admin/outreach-previews${returnParams.toString() ? `?${returnParams.toString()}` : ""}`;

  const user = await requireTiOutreachAdmin(returnTo);

  const campaignId = searchParams?.campaign_id?.trim() || "";
  const sport = normalizeSportFilterParam(searchParams?.sport);
  const selectedId = searchParams?.preview_id?.trim() || "";
  const startAfter = normalizeDateParam(searchParams?.start_after);
  const directorEmailFilter = normalizeDirectorEmailParam(searchParams?.director_email);
  const tournamentNameFilter = normalizeTournamentNameParam(searchParams?.tournament_q);
  const emailOverridesOtherFilters = Boolean(directorEmailFilter);
  const tournamentOverridesOtherFilters = Boolean(tournamentNameFilter);
  const globalOverridesOtherFilters = emailOverridesOtherFilters || tournamentOverridesOtherFilters;
  const defaultMode = getOutreachMode();
  const todayIso = new Date().toISOString().slice(0, 10);

  const formatSupabaseError = (err: any) => {
    if (!err) return "Unknown error";
    const message = typeof err?.message === "string" ? err.message : String(err);
    const code = typeof err?.code === "string" && err.code ? ` [${err.code}]` : "";
    const details = typeof err?.details === "string" && err.details ? ` — ${err.details}` : "";
    const hint = typeof err?.hint === "string" && err.hint ? ` (hint: ${err.hint})` : "";
    return `${message}${code}${details}${hint}`;
  };

  const { count: staffVerifiedTodayCount, error: staffVerifiedError } = await (supabaseAdmin.from(
    "tournaments" as any
  ) as any)
    .select("id", { count: "exact", head: true })
    .gte("tournament_staff_verified_at", todayIso);

  if (staffVerifiedError) {
    throw new Error(staffVerifiedError.message);
  }

  // Campaign dropdown: show the most recent campaigns even if the current filter returns 0 rows.
  const { data: recentCampaignRows } = await (supabaseAdmin.from("email_outreach_previews" as any) as any)
    .select("campaign_id,created_at")
    .order("created_at", { ascending: false })
    .limit(600);
  const recentCampaignOptions = Array.from(
    new Set(((recentCampaignRows ?? []) as Array<{ campaign_id?: string | null }>).map((row) => row.campaign_id).filter(Boolean))
  ) as string[];

  const previewsListSelect =
    "id,created_at,sent_at,send_attempt_count,director_replied_at,sport,campaign_id,tournament_id,tournament_ids,tournament_name,director_email,verify_url,subject,variant,provider_message_id,status,error";

  const baseQuery = () =>
    (supabaseAdmin.from("email_outreach_previews" as any) as any)
      .select(previewsListSelect)
      .order("created_at", { ascending: false });

  const applyFilters = (query: any) => {
    // Director email search and tournament-name search are intended as global lookups across campaigns/sports/timeframes.
    // Campaign/sport/start_after filters are still useful for batch work, but should not block finding a specific target.
    if (!globalOverridesOtherFilters) {
      if (campaignId) query = query.eq("campaign_id", campaignId);
      if (sport) query = query.eq("sport", sport);
    }
    if (directorEmailFilter) query = query.ilike("director_email", `%${directorEmailFilter}%`);
    return query;
  };

  const dedupeById = (rows: PreviewRow[]) => {
    const map = new Map<string, PreviewRow>();
    for (const row of rows) {
      if (!row?.id) continue;
      if (!map.has(row.id)) map.set(row.id, row);
    }
    return Array.from(map.values()).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  };

  let previews: PreviewRow[] = [];

  if (tournamentNameFilter) {
    // First, look up tournament ids that match the name (so we can match previews where the tournament
    // is included in `tournament_ids` even if it's not the primary `tournament_name` for the preview row).
    let matchingTournamentIds: string[] = [];
    try {
      const { data: tournamentMatchRows, error: tournamentMatchError } = await (supabaseAdmin.from("tournaments" as any) as any)
        .select("id")
        .ilike("name", `%${tournamentNameFilter}%`)
        .limit(200);
      if (tournamentMatchError) {
        console.error("[ti-outreach-previews] tournament name lookup failed", {
          tournamentNameFilter,
          error: tournamentMatchError.message,
        });
      } else {
        matchingTournamentIds = Array.from(
          new Set(((tournamentMatchRows ?? []) as Array<{ id?: string | null }>).map((row) => row.id).filter(Boolean))
        ) as string[];
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[ti-outreach-previews] tournament name lookup threw", { tournamentNameFilter, error: message });
      matchingTournamentIds = [];
    }

    const tasks: Array<Promise<{ data: any; error: any }>> = [];

    // Primary preview row name match (fast path).
    tasks.push(applyFilters(baseQuery()).ilike("tournament_name", `%${tournamentNameFilter}%`).limit(200));

    if (matchingTournamentIds.length > 0) {
      // Match previews where the primary tournament_id matches.
      tasks.push(applyFilters(baseQuery()).in("tournament_id", matchingTournamentIds).limit(200));
      // Match previews where the tournament is included in the multi-tournament payload.
      try {
        tasks.push((applyFilters(baseQuery()) as any).overlaps("tournament_ids", matchingTournamentIds).limit(200));
      } catch (err) {
        // Some deployments may have `tournament_ids` as JSON rather than an array; ignore if unsupported.
        const message = err instanceof Error ? err.message : String(err);
        console.error("[ti-outreach-previews] tournament_ids overlaps unsupported", { error: message });
      }
    }

    const results = await Promise.all(tasks);
    const rows = results.flatMap((result) => (result?.data ?? []) as PreviewRow[]);
    const errors = results.map((result) => result?.error).filter(Boolean);
    if (errors.length > 0) {
      throw new Error(errors[0].message || String(errors[0]));
    }
    previews = dedupeById(rows).slice(0, 200);
  } else {
    const { data, error } = await applyFilters(baseQuery()).limit(200);
    if (error) throw new Error(error.message);
    previews = (data ?? []) as PreviewRow[];
  }

  const selectedPreviewId = selectedId || previews[0]?.id || "";
  let selectedPreview = previews.find((preview) => preview.id === selectedPreviewId) ?? previews[0] ?? null;
  const campaignOptions = recentCampaignOptions.length ? recentCampaignOptions : Array.from(new Set(previews.map((preview) => preview.campaign_id)));
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

    selectedPreview = previews.find((preview) => preview.id === selectedPreviewId) ?? previews[0] ?? null;
    tournamentIds = Array.from(new Set(previews.map((preview) => preview.tournament_id).filter(Boolean))) as string[];
  }

  const detailPreviewId = selectedPreview?.id || "";
  if (detailPreviewId) {
    const { data: selectedDetail, error: selectedDetailError } = await (supabaseAdmin.from(
      "email_outreach_previews" as any
    ) as any)
      .select(`${previewsListSelect},html_body,text_body`)
      .eq("id", detailPreviewId)
      .maybeSingle();

    if (selectedDetailError) {
      throw new Error(selectedDetailError.message);
    }

    if (selectedDetail?.id) {
      const startDate = previews.find((preview) => preview.id === selectedDetail.id)?.tournament_start_date ?? null;
      selectedPreview = { ...(selectedDetail as PreviewRow), tournament_start_date: startDate };
    }
  }

  let eligibleCount: number | null = null;
  let eligibleCountError: string | null = null;
  if (sport) {
    try {
      eligibleCount = await countEligibleOutreachBySport(sport, startAfter);
    } catch (err) {
      eligibleCount = null;
      eligibleCountError = err instanceof Error ? err.message : String(err);
      console.error("[ti-outreach-previews] eligible count failed", { sport, startAfter, error: eligibleCountError });
    }
  }

  let suppressionMap = new Map<string, SuppressionRow>();
  let suppressionLoadError: string | null = null;
  if (tournamentIds.length > 0) {
    const { data: suppressionData, error: suppressionError } = await (supabaseAdmin.from(
      "email_outreach_suppressions" as any
    ) as any)
      .select("tournament_id,reason,status")
      .in("tournament_id", tournamentIds);

    if (suppressionError) {
      suppressionLoadError = formatSupabaseError(suppressionError);
      console.error("[ti-outreach-previews] suppression load failed", {
        campaignId,
        sport,
        startAfter,
        error: suppressionLoadError,
      });
      suppressionMap = new Map();
    } else {
      suppressionMap = new Map(
        ((suppressionData ?? []) as SuppressionRow[]).map((row) => [row.tournament_id, row])
      );
    }
  }

  const suppressionByTournamentId = Object.fromEntries(
    Array.from(suppressionMap.entries()).map(([id, row]) => [id, { status: row.status }])
  );

	  return (
      // This admin tool benefits from a wider canvas than the default `ti-shell` (1080px).
      // Use a full-bleed wrapper to avoid excessive empty space on large screens without
      // affecting other pages.
      <div style={{ width: "100vw", marginLeft: "calc(50% - 50vw)" }}>
	    <main style={{ paddingLeft: 12, paddingRight: 12 }}>
	      <div style={{ maxWidth: 1800, margin: "0 auto", display: "grid", gap: 16 }}>
	        <section className="bodyCard" style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <h1 style={{ margin: 0 }}>Outreach Previews</h1>
            <p className="muted" style={{ margin: 0 }}>
              Review preview-mode tournament director emails without sending anything.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/admin/outreach-reply" style={{ color: "#2563EB", fontWeight: 700 }}>
                Generate verify-reply email (second step)
              </Link>
              <Link
                href={`/admin/outreach-dashboard?sport=${encodeURIComponent(sport || "soccer")}${
                  campaignId ? `&campaign_id=${encodeURIComponent(campaignId)}` : ""
                }${startAfter ? `&start_after=${encodeURIComponent(startAfter)}` : ""}`}
                style={{ color: "#2563EB", fontWeight: 700 }}
              >
                Outreach dashboard
              </Link>
            </div>
          </div>

          {eligibleCountError || suppressionLoadError ? (
            <div
              style={{
                border: "1px solid #fde68a",
                background: "#fffbeb",
                borderRadius: 12,
                padding: "10px 12px",
                color: "#92400e",
                fontSize: 13,
                lineHeight: 1.35,
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 4 }}>Outreach data temporarily unavailable</div>
              {eligibleCountError ? <div>Eligible count failed: {eligibleCountError}</div> : null}
              {suppressionLoadError ? <div>Suppression list failed: {suppressionLoadError}</div> : null}
            </div>
          ) : null}

	          <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
	            <label style={{ display: "grid", gap: 6 }}>
	              <span style={{ fontWeight: 600 }}>Campaign</span>
                <AutoSubmitSelect name="campaign_id" defaultValue={campaignId} style={inputStyle}>
                  <option value="">All campaigns</option>
                  {campaignOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </AutoSubmitSelect>
	            </label>
	            <label style={{ display: "grid", gap: 6 }}>
		              <span style={{ fontWeight: 600 }}>Sport</span>
		              <AutoSubmitSelect name="sport" defaultValue={sport} style={inputStyle}>
		                <option value="">All sports</option>
	                {TI_SPORTS.map((value) => (
	                  <option key={value} value={value}>
	                    {TI_SPORT_LABELS[value]}
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
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>Director email</span>
                <input
                  type="email"
                  name="director_email"
                  defaultValue={directorEmailFilter}
                  placeholder="director@example.com"
                  style={{ ...inputStyle, minWidth: 260 }}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>Tournament name</span>
                <input
                  type="text"
                  name="tournament_q"
                  defaultValue={tournamentNameFilter}
                  placeholder="e.g. Jefferson Cup"
                  style={{ ...inputStyle, minWidth: 260 }}
                />
              </label>
	            <button type="submit" className="cta ti-home-cta ti-home-cta-primary">
	              Apply filters
	            </button>
	            <Link href="/admin/outreach-previews" className="cta ti-home-cta ti-home-cta-secondary">
	              Clear
	            </Link>
	          </form>
            {globalOverridesOtherFilters ? (
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                Search ignores campaign and sport filters.
              </p>
            ) : null}
            {!directorEmailFilter && tournamentNameFilter ? (
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                Tip: tournament search helps find replies when the reply-from email differs from the sent-to address.
              </p>
            ) : null}

	          <GeneratePreviewsForm
	            initialCampaignId={campaignId}
	            initialSport={sport || "soccer"}
	            initialStartAfter={startAfter}
	            sports={TI_SPORTS}
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
          ) : eligibleCountError ? (
            <p className="muted" style={{ margin: 0 }}>
              Eligible count unavailable (check server logs).
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
	            campaignId={globalOverridesOtherFilters ? "" : campaignId}
	            sport={globalOverridesOtherFilters ? "" : sport}
              directorEmail={directorEmailFilter}
	            suppressionByTournamentId={suppressionByTournamentId}
	            startAfter={globalOverridesOtherFilters ? "" : startAfter}
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
	                  <InfoCard
                      label="Email"
                      value={
                        <span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <span>{selectedPreview.director_email}</span>
                          {selectedPreview.director_email ? (
                            <Link
                              href={`/admin/outreach-previews?director_email=${encodeURIComponent(
                                selectedPreview.director_email.trim().toLowerCase()
                              )}`}
                              style={smallLinkStyle}
                            >
                              Search email
                            </Link>
                          ) : null}
                        </span>
                      }
                    />
	                  <InfoCard label="Campaign" value={selectedPreview.campaign_id} />
	                  <InfoCard label="Variant" value={selectedPreview.variant || "NA"} />
	                  <InfoCard label="Status" value={selectedPreview.status} />
	                  <InfoCard
	                    label="Sent"
	                    value={
	                      selectedPreview.sent_at ? (
	                        new Date(selectedPreview.sent_at).toLocaleString()
	                      ) : (
	                        <span className="muted">—</span>
	                      )
	                    }
	                  />
	                  <InfoCard
	                    label="Attempts"
	                    value={typeof selectedPreview.send_attempt_count === "number" ? selectedPreview.send_attempt_count : 0}
	                  />
	                  <InfoCard
	                    label="Replied"
	                    value={selectedPreview.director_replied_at ? new Date(selectedPreview.director_replied_at).toLocaleString() : "—"}
	                  />
	                  <InfoCard
	                    label="Verify URL"
	                    value={
	                      selectedPreview.verify_url ? (
                        <a href={selectedPreview.verify_url} target="_blank" rel="noreferrer" style={smallLinkStyle}>
                          Open verify link
                        </a>
                      ) : (
                        <span className="muted">No verify link (intro email)</span>
                      )
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
                {selectedPreview.verify_url ? (
                  <CopyFieldButton label="Copy verify URL" value={selectedPreview.verify_url} />
                ) : null}
                <CopyFieldButton label="Copy HTML" value={selectedPreview.html_body ?? ""} />
              </div>

	              <PreviewAdminActions
	                previewId={selectedPreview.id}
	                tournamentId={selectedPreview.tournament_id}
	                previewLabel={selectedPreview.tournament_name}
	                campaignId={campaignId || selectedPreview.campaign_id}
	                sport={sport || selectedPreview.sport}
	                directorEmail={selectedPreview.director_email}
                  directorRepliedAt={selectedPreview.director_replied_at ?? null}
                  directorEmailFilter={directorEmailFilter}
	                defaultTestEmail={user.email || ""}
	                isSuppressed={!!(selectedPreview.tournament_id && suppressionMap.get(selectedPreview.tournament_id))}
	              />

              <section style={{ display: "grid", gap: 8 }}>
                <h3 style={{ margin: 0 }}>HTML preview</h3>
                <iframe
                  title="Outreach HTML preview"
                  sandbox=""
                  srcDoc={selectedPreview.html_body ?? ""}
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
                  {selectedPreview.text_body ?? ""}
                </pre>
              </section>
            </div>
          ) : null}
        </section>
      </div>
    </main>
    </div>
  );
}

type OutreachSport = TiSport;

function normalizeSportFilterParam(value?: string) {
  const normalized = (value || "").trim().toLowerCase();
  if (TI_SPORTS.includes(normalized as OutreachSport)) return normalized;
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

function normalizeDirectorEmailParam(value?: string) {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.length > 320) return "";
  return normalized;
}

function normalizeTournamentNameParam(value?: string) {
  const normalized = (value || "").trim();
  if (!normalized) return "";
  if (normalized.length > 120) return normalized.slice(0, 120);
  return normalized;
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

  // Smaller chunks keep the PostgREST "IN" filter from timing out on large campaigns.
  const idChunkSize = 250;
  for (let i = 0; i < tournamentIds.length; i += idChunkSize) {
    const slice = tournamentIds.slice(i, i + idChunkSize);
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
