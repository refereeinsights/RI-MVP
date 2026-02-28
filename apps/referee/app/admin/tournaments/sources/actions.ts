"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runTopTierCrawler } from "@/lib/admin/topTierCrawler";
import { createTournamentFromUrl } from "@/server/admin/pasteUrl";
import {
  normalizeSourceUrl,
  upsertRegistry,
  getRegistryRowByUrl,
  getSkipReason,
  updateRegistrySweep,
  insertSourceLog,
} from "@/server/admin/sources";
import { SweepError, buildSweepSummary } from "@/server/admin/sweepDiagnostics";

const SPORT_OPTIONS = [
  "soccer",
  "futsal",
  "basketball",
  "baseball",
  "softball",
  "lacrosse",
  "volleyball",
  "football",
  "wrestling",
  "hockey",
  "other",
] as const;

const TOURNAMENT_SPORTS = SPORT_OPTIONS;

function describeActionError(err: any) {
  if (!err) return "unknown_error";
  const parts = [err.message, err.code, err.details, err.hint].filter(Boolean);
  if (parts.length) return parts.join(" | ");
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function buildSourcesNoticeUrl(
  stickyQueryString: string,
  noticeMessage: string,
  extraParams?: Record<string, string | null | undefined>
) {
  const params = new URLSearchParams(stickyQueryString);
  if (noticeMessage) params.set("notice", noticeMessage);
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value === null || value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
  }
  return `/admin/tournaments/sources${params.toString() ? `?${params.toString()}` : ""}`;
}

export async function upsertSourceAction(stickyQueryString: string, formData: FormData) {
  await requireAdmin();
  const source_url = String(formData.get("source_url") || "").trim();
  if (!source_url) {
    redirect(buildSourcesNoticeUrl(stickyQueryString, "Source URL is required"));
  }
  const source_type = String(formData.get("source_type") || "").trim() || null;
  const sport = String(formData.get("sport") || "").trim() || null;
  if (!source_type || !sport) {
    redirect(buildSourcesNoticeUrl(stickyQueryString, "Sport and source type are required"));
  }
  const state = String(formData.get("state") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const is_active = String(formData.get("is_active") || "") === "on";
  const review_status = "untested";

  try {
    const { canonical } = normalizeSourceUrl(source_url);
    const existing = await getRegistryRowByUrl(canonical);
    await upsertRegistry({
      source_url: canonical,
      source_type,
      sport,
      state,
      city,
      notes,
      is_active,
      review_status,
    });
    const noticeMsg = existing.row ? "Source already exists. Updated existing entry." : "Saved source";
    redirect(buildSourcesNoticeUrl(stickyQueryString, noticeMsg, { source_url: canonical }));
  } catch (err: any) {
    if (err?.digest) throw err;
    redirect(buildSourcesNoticeUrl(stickyQueryString, `Save failed: ${err?.message ?? "unknown error"}`));
  }
}

export async function updateStatusAction(stickyQueryString: string, formData: FormData) {
  await requireAdmin();
  try {
    const id = String(formData.get("id") || "");
    const review_status = String(formData.get("review_status") || "untested");
    const review_notes = String(formData.get("review_notes") || "").trim() || null;
    const is_active = String(formData.get("is_active") || "") === "on";
    const ignore_until = String(formData.get("ignore_until") || "").trim() || null;
    const { error } = await supabaseAdmin
      .from("tournament_sources" as any)
      .update({ review_status, review_notes, is_active, ignore_until: ignore_until || null })
      .eq("id", id)
      .is("tournament_id", null);
    const noticeMsg = error ? `Status update failed: ${describeActionError(error)}` : "Updated source status";
    redirect(buildSourcesNoticeUrl(stickyQueryString, noticeMsg));
  } catch (err: any) {
    if (err?.digest && String(err.digest).includes("NEXT_REDIRECT")) throw err;
    redirect(buildSourcesNoticeUrl(stickyQueryString, `Status update exception: ${describeActionError(err)}`));
  }
}

export async function updateMetadataAction(stickyQueryString: string, formData: FormData) {
  await requireAdmin();
  try {
    const id = String(formData.get("id") || "");
    const source_type = String(formData.get("source_type") || "").trim() || null;
    const sport = String(formData.get("sport") || "").trim() || null;
    const state = String(formData.get("state") || "").trim().toUpperCase() || null;
    const city = String(formData.get("city") || "").trim() || null;
    const { error } = await supabaseAdmin
      .from("tournament_sources" as any)
      .update({
        source_type,
        sport,
        state,
        city,
      })
      .eq("id", id)
      .is("tournament_id", null);
    const noticeMsg = error ? `Metadata update failed: ${describeActionError(error)}` : "Updated source metadata";
    redirect(buildSourcesNoticeUrl(stickyQueryString, noticeMsg));
  } catch (err: any) {
    if (err?.digest && String(err.digest).includes("NEXT_REDIRECT")) throw err;
    redirect(buildSourcesNoticeUrl(stickyQueryString, `Metadata update exception: ${describeActionError(err)}`));
  }
}

export async function quickActionAction(sourcesBasePath: string, stickyQueryString: string, formData: FormData) {
  await requireAdmin();
  try {
    const id = String(formData.get("id") || "");
    const action = String(formData.get("action") || "");
    const redirectUrl = formData.get("redirect") as string | null;
    const updates: any = {};
    if (action === "keep") {
      updates.review_status = "keep";
      updates.is_active = true;
    } else if (action === "dead") {
      updates.review_status = "dead";
      updates.is_active = false;
    } else if (action === "login") {
      updates.review_status = "login_required";
      updates.is_active = false;
    } else if (action === "js_only") {
      updates.review_status = "js_only";
      updates.is_active = false;
    } else if (action === "paywalled") {
      updates.review_status = "paywalled";
      updates.is_active = false;
    } else if (action === "blocked") {
      updates.review_status = "blocked_403";
      const now = new Date();
      now.setDate(now.getDate() + 7);
      updates.ignore_until = now.toISOString();
      updates.is_active = false;
    } else if (action === "clear_block") {
      updates.review_status = "needs_review";
      updates.ignore_until = null;
      updates.is_active = true;
    }
    if (!Object.keys(updates).length) {
      redirect(redirectUrl || sourcesBasePath);
    }
    const { error } = await supabaseAdmin
      .from("tournament_sources" as any)
      .update(updates)
      .eq("id", id)
      .is("tournament_id", null);
    const msg = error ? `Quick action failed: ${describeActionError(error)}` : "Updated source";
    const target = redirectUrl || sourcesBasePath;
    const base = new URL(target, "http://localhost");
    base.searchParams.set("notice", msg);
    redirect(`${base.pathname}?${base.searchParams.toString()}`);
  } catch (err: any) {
    if (err?.digest && String(err.digest).includes("NEXT_REDIRECT")) throw err;
    redirect(buildSourcesNoticeUrl(stickyQueryString, `Quick action exception: ${describeActionError(err)}`));
  }
}

export async function sweepSourceAction(stickyQueryString: string, formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const sourceUrl = String(formData.get("source_url") || "").trim();
  const sourceType = String(formData.get("source_type") || "").trim() || null;
  const sportRaw = String(formData.get("sport") || "soccer").toLowerCase();
  const overrideSkip = String(formData.get("override_skip") || "") === "on";
  if (!id || !sourceUrl) {
    redirect(buildSourcesNoticeUrl(stickyQueryString, "Missing source URL"));
  }

  const sport = TOURNAMENT_SPORTS.includes(sportRaw as any) ? (sportRaw as any) : "soccer";
  const { canonical, normalized, host } = normalizeSourceUrl(sourceUrl);
  const { data: row, error: rowError } = await supabaseAdmin
    .from("tournament_sources" as any)
    .select("id,source_url,url,is_active,review_status,review_notes,ignore_until")
    .eq("id", id)
    .maybeSingle();
  const registryRow = row as any;
  if (rowError || !registryRow) {
    redirect(buildSourcesNoticeUrl(stickyQueryString, "Source not found"));
  }
  await supabaseAdmin
    .from("tournament_sources" as any)
    .update({
      source_url: canonical,
      url: canonical,
      normalized_url: normalized,
      normalized_host: host,
      source_type: sourceType,
      sport,
    })
    .eq("id", registryRow.id);
  const skipReason = getSkipReason(registryRow);
  if (skipReason && !overrideSkip) {
    await updateRegistrySweep(registryRow.id, "warn", `Skipped: ${skipReason}`);
    redirect(
      buildSourcesNoticeUrl(
        stickyQueryString,
        `Sweep skipped: ${skipReason}. Update source status or enable override.`,
        { source_url: canonical }
      )
    );
  }

  await supabaseAdmin
    .from("tournament_sources" as any)
    .update({ last_tested_at: new Date().toISOString() })
    .eq("id", registryRow.id);

  const startedAt = Date.now();
  try {
    const res = await createTournamentFromUrl({
      url: canonical,
      sport,
      sourceType,
      status: "draft",
      source: "external_crawl",
    });
    const detailCounts = (res.details?.counts ?? null) as
      | { found?: number | null; with_website?: number | null; with_email?: number | null; with_phone?: number | null }
      | null;
    const payload = {
      version: 1,
      action: res.slug ?? null,
      source_url: canonical,
      final_url: res.diagnostics?.final_url ?? null,
      http_status: res.diagnostics?.status ?? null,
      error_code: null,
      message: "Sweep succeeded",
      content_type: res.diagnostics?.content_type ?? null,
      bytes: res.diagnostics?.bytes ?? null,
      timing_ms: Date.now() - startedAt,
      redirect_count: res.diagnostics?.redirect_count ?? null,
      redirect_chain: res.diagnostics?.redirect_chain ?? [],
      location_header: res.diagnostics?.location_header ?? null,
      extracted_count: res.extracted_count ?? 1,
      count_found: detailCounts?.found ?? null,
      count_with_website: detailCounts?.with_website ?? null,
      count_with_email: detailCounts?.with_email ?? null,
      count_with_phone: detailCounts?.with_phone ?? null,
      sample: res.details?.sample ?? null,
    };
    const logId = await insertSourceLog({
      source_id: registryRow.id,
      action: "sweep",
      level: "info",
      payload,
    });
    await updateRegistrySweep(registryRow.id, "ok", JSON.stringify({ ...payload, log_id: logId }));
    redirect(
      buildSourcesNoticeUrl(
        stickyQueryString,
        res.extracted_count && res.extracted_count > 1
          ? `Imported ${res.extracted_count} events and queued enrichment.`
          : `Created "${res.meta.name ?? res.slug}" and queued enrichment.`,
        { source_url: canonical }
      )
    );
  } catch (err: any) {
    const timingMs = Date.now() - startedAt;
    if (err?.digest && String(err.digest).includes("NEXT_REDIRECT")) {
      throw err;
    }
    if (err instanceof SweepError) {
      const payload = {
        version: 1,
        source_url: canonical,
        final_url: err.diagnostics?.final_url ?? null,
        http_status: err.diagnostics?.status ?? null,
        error_code: err.code,
        message: err.message,
        content_type: err.diagnostics?.content_type ?? null,
        bytes: err.diagnostics?.bytes ?? null,
        timing_ms: timingMs,
        redirect_count: err.diagnostics?.redirect_count ?? null,
        redirect_chain: err.diagnostics?.redirect_chain ?? [],
        location_header: err.diagnostics?.location_header ?? null,
        extracted_count: null,
        usclub: (err.diagnostics as any)?.usclub ?? null,
      };
      const logId = await insertSourceLog({
        source_id: registryRow.id,
        action: "sweep",
        level: "error",
        payload,
      });
      await updateRegistrySweep(
        registryRow.id,
        err.code,
        buildSweepSummary(err.code, err.message, err.diagnostics, { log_id: logId })
      );
    } else {
      const legacyMessage = String(err?.message ?? "");
      if (legacyMessage === "failed_to_fetch_html") {
        const payload = {
          version: 1,
          source_url: canonical,
          final_url: null,
          http_status: null,
          error_code: "fetch_failed",
          message: "Request failed",
          content_type: null,
          bytes: null,
          timing_ms: timingMs,
          redirect_count: null,
          redirect_chain: [],
          location_header: null,
          extracted_count: null,
        };
        const logId = await insertSourceLog({
          source_id: registryRow.id,
          action: "sweep",
          level: "error",
          payload,
        });
        await updateRegistrySweep(
          registryRow.id,
          "fetch_failed",
          buildSweepSummary("fetch_failed", payload.message, {}, { log_id: logId })
        );
      } else {
        const payload = {
          version: 1,
          source_url: canonical,
          final_url: null,
          http_status: null,
          error_code: "extractor_error",
          message: legacyMessage || "unknown error",
          content_type: null,
          bytes: null,
          timing_ms: timingMs,
          redirect_count: null,
          redirect_chain: [],
          location_header: null,
          extracted_count: null,
        };
        const logId = await insertSourceLog({
          source_id: registryRow.id,
          action: "sweep",
          level: "error",
          payload,
        });
        await updateRegistrySweep(
          registryRow.id,
          "extractor_error",
          buildSweepSummary("extractor_error", payload.message, {}, { log_id: logId })
        );
      }
    }
    redirect(
      buildSourcesNoticeUrl(stickyQueryString, `Sweep failed: ${err?.message ?? "unknown error"}`, {
        source_url: canonical,
      })
    );
  }
}

export async function runTopTierSweepAction(stickyQueryString: string) {
  await requireAdmin();
  try {
    const result = await runTopTierCrawler({
      writeDb: true,
      maxPages: 250,
      sports: ["baseball", "softball", "basketball"],
    });
    const s = result.summary;
    const message = `Top Tier crawl complete: urls=${s.candidateUrls}, events=${s.acceptedEvents}, tournaments=${s.tournamentsUpserted}, venues+${s.venuesCreated}, links+${s.venueLinksCreated}`;
    redirect(buildSourcesNoticeUrl(stickyQueryString, message));
  } catch (err: any) {
    if (err?.digest && String(err.digest).includes("NEXT_REDIRECT")) throw err;
    redirect(buildSourcesNoticeUrl(stickyQueryString, `Top Tier crawl failed: ${describeActionError(err)}`));
  }
}
