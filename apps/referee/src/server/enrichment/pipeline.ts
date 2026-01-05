import { ContactCandidate, VenueCandidate, CompCandidate, PageResult } from "./types";
import { extractFromPage, rankLinks } from "./extract";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type JobRow = {
  id: string;
  tournament_id: string;
  status: string;
  attempt_count: number;
  pages_fetched_count: number;
};

type TournamentRow = { id: string; name: string | null; url: string | null };

const MAX_PAGES = 8;
const FETCH_TIMEOUT_MS = 10000;
const MAX_BYTES = 1024 * 1024; // 1MB
const PER_DOMAIN_DELAY_MS = 500;

const domainLastFetch = new Map<string, number>();

async function politeFetch(url: string): Promise<string | null> {
  try {
    const parsed = new URL(url);
    const last = domainLastFetch.get(parsed.hostname) ?? 0;
    const waitMs = Math.max(0, PER_DOMAIN_DELAY_MS - (Date.now() - last));
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const resp = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "RI-Tournament-Enricher/1.0" },
    });
    clearTimeout(timeout);
    domainLastFetch.set(parsed.hostname, Date.now());
    const ct = resp.headers.get("content-type") || "";
    if (!ct.includes("text/html")) {
      return null;
    }
    const reader = resp.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.length;
        if (received > MAX_BYTES) break;
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch (err) {
    console.warn("[enricher] fetch failed", url, err);
    return null;
  }
}

async function scrapeTournament(url: string): Promise<{ pages: number; contacts: ContactCandidate[]; venues: VenueCandidate[]; comps: CompCandidate[] }> {
  const seen = new Set<string>();
  const queue: string[] = [url];
  let pagesFetched = 0;
  const contacts: ContactCandidate[] = [];
  const venues: VenueCandidate[] = [];
  const comps: CompCandidate[] = [];

  while (queue.length && pagesFetched < MAX_PAGES) {
    const nextUrl = queue.shift()!;
    if (seen.has(nextUrl)) continue;
    seen.add(nextUrl);

    const html = await politeFetch(nextUrl);
    if (!html) continue;
    pagesFetched += 1;

    const pageResults: PageResult = extractFromPage(html, nextUrl);
    contacts.push(...pageResults.contacts);
    venues.push(...pageResults.venues);
    comps.push(...pageResults.comps, ...pageResults.pdfHints);

    // Seed queue with ranked links from this page
    try {
      const ranked = rankLinks(require("cheerio").load(html), new URL(nextUrl));
      for (const link of ranked) {
        if (queue.length + seen.size >= MAX_PAGES + 5) break;
        if (!seen.has(link)) queue.push(link);
      }
    } catch {
      // ignore rank errors
    }
  }

  return { pages: pagesFetched, contacts, venues, comps };
}

async function upsertCandidates(
  tournamentId: string,
  contacts: ContactCandidate[],
  venues: VenueCandidate[],
  comps: CompCandidate[]
) {
  const withTid = <T extends { tournament_id: string }>(rows: T[]) =>
    rows.map((r) => ({ ...r, tournament_id: tournamentId }));

  if (contacts.length) {
    await supabaseAdmin.from("tournament_contact_candidates" as any).insert(withTid(contacts));
  }
  if (venues.length) {
    await supabaseAdmin.from("tournament_venue_candidates" as any).insert(withTid(venues));
  }
  if (comps.length) {
    await supabaseAdmin.from("tournament_referee_comp_candidates" as any).insert(withTid(comps));
  }
}

async function processJob(job: JobRow) {
  const tournamentResp = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,name,source_url")
    .eq("id", job.tournament_id)
    .maybeSingle();
  if (tournamentResp.error) {
    throw tournamentResp.error;
  }
  const t = tournamentResp.data as any;
  const tourneyUrl = t?.source_url ?? null;
  if (!tourneyUrl) {
    throw new Error("tournament_url_missing");
  }
  const scrape = await scrapeTournament(tourneyUrl);
  await upsertCandidates(job.tournament_id, scrape.contacts.slice(0, 20), scrape.venues.slice(0, 10), scrape.comps.slice(0, 5));
  return scrape.pages;
}

export async function runQueuedEnrichment(limit = 10) {
  const jobResp = await supabaseAdmin
    .from("tournament_enrichment_jobs" as any)
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (jobResp.error) throw jobResp.error;
  const jobs = (jobResp.data ?? []) as JobRow[];

  const results: Array<{ id: string; status: string; pages: number; error?: string }> = [];
  for (const job of jobs) {
    await supabaseAdmin
      .from("tournament_enrichment_jobs" as any)
      .update({ status: "running", attempt_count: (job.attempt_count ?? 0) + 1, started_at: new Date().toISOString(), last_error: null })
      .eq("id", job.id);
    try {
      const pages = await processJob(job);
      await supabaseAdmin
        .from("tournament_enrichment_jobs" as any)
        .update({
          status: "done",
          finished_at: new Date().toISOString(),
          pages_fetched_count: pages,
        })
        .eq("id", job.id);
      results.push({ id: job.id, status: "done", pages });
    } catch (err: any) {
      await supabaseAdmin
        .from("tournament_enrichment_jobs" as any)
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          last_error: err?.message ?? "unknown_error",
        })
        .eq("id", job.id);
      results.push({ id: job.id, status: "error", pages: 0, error: err?.message });
    }
  }
  return results;
}

export async function queueEnrichmentJobs(tournamentIds: string[]) {
  if (!tournamentIds.length) return { inserted: 0 };
  const rows = tournamentIds.map((tid) => ({ tournament_id: tid, status: "queued" }));
  const resp = await supabaseAdmin.from("tournament_enrichment_jobs" as any).insert(rows);
  if (resp.error && resp.error.code !== "23505") {
    // 23505 = unique violation (duplicate queued/running job); ignore to keep idempotent
    throw resp.error;
  }
  return { inserted: rows.length };
}
