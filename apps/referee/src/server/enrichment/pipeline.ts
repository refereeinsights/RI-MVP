import { ContactCandidate, VenueCandidate, CompCandidate, DateCandidate, PageResult, AttributeCandidate } from "./types";
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
const DEEP_DATE_MAX_PAGES = 16;
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

async function scrapeTournament(
  url: string,
  options?: { maxPages?: number; dateFocus?: boolean }
): Promise<{
  pages: number;
  contacts: ContactCandidate[];
  venues: VenueCandidate[];
  comps: CompCandidate[];
  dates: DateCandidate[];
  attributes: AttributeCandidate[];
}> {
  const maxPages = Math.max(1, Math.min(options?.maxPages ?? MAX_PAGES, DEEP_DATE_MAX_PAGES));
  const dateFocus = options?.dateFocus ?? false;
  const seen = new Set<string>();
  const queue: string[] = [url];
  let pagesFetched = 0;
  const contacts: ContactCandidate[] = [];
  const venues: VenueCandidate[] = [];
  const comps: CompCandidate[] = [];
  const dates: DateCandidate[] = [];
  const attributes: AttributeCandidate[] = [];

  while (queue.length && pagesFetched < maxPages) {
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
    dates.push(...pageResults.dates);
    attributes.push(...pageResults.attributes);

    // Seed queue with ranked links from this page
    try {
      const ranked = rankLinks(require("cheerio").load(html), new URL(nextUrl));
      const priorityRegex = dateFocus
        ? /(date|dates|schedule|calendar|event|events|register|registration|contact|questions|referee|officials|assignor|director|staff|tournament|about|help|support)/i
        : /(contact|questions|referee|referees|officials|assignor|director|staff|tournament|about|help|support)/i;
      const priority = ranked.filter((link) => priorityRegex.test(link)).slice(0, 2);
      for (const link of priority.reverse()) {
        if (queue.length + seen.size >= maxPages + 5) break;
        if (!seen.has(link) && !queue.includes(link)) queue.unshift(link);
      }
      for (const link of ranked) {
        if (queue.length + seen.size >= maxPages + 5) break;
        if (!seen.has(link)) queue.push(link);
      }
    } catch {
      // ignore rank errors
    }
  }

  return { pages: pagesFetched, contacts, venues, comps, dates, attributes };
}

async function upsertCandidates(
  tournamentId: string,
  contacts: ContactCandidate[],
  venues: VenueCandidate[],
  comps: CompCandidate[],
  dates: DateCandidate[],
  attributes: AttributeCandidate[]
) {
  const withTid = <T extends { tournament_id: string }>(rows: T[]) =>
    rows.map((r) => ({ ...r, tournament_id: tournamentId }));
  const contactsNoPhone = contacts.map((c) => ({ ...c, phone: null }));

  const norm = (val: string | null | undefined) => (val ?? "").trim().toLowerCase();
  const normEmail = (val: string | null | undefined) => norm(val);
  const normPhone = (val: string | null | undefined) => (val ?? "").replace(/\D+/g, "");
  const normRole = (val: string | null | undefined) => (val ?? "GENERAL").trim().toUpperCase();

  if (contactsNoPhone.length) {
    const { data: existing } = await supabaseAdmin
      .from("tournament_contact_candidates" as any)
      .select("role_normalized,name,email,phone")
      .eq("tournament_id", tournamentId)
      .is("accepted_at", null)
      .is("rejected_at", null);
    const existingSig = new Set(
      (existing ?? []).map((c: any) =>
        [normRole(c.role_normalized), norm(c.name), normEmail(c.email), normPhone(c.phone)].join("|")
      )
    );
    const batchSig = new Set<string>();
    const deduped = contactsNoPhone.filter((c) => {
      const sig = [
        normRole(c.role_normalized),
        norm(c.name),
        normEmail(c.email),
        normPhone(c.phone),
      ].join("|");
      if (existingSig.has(sig) || batchSig.has(sig)) return false;
      batchSig.add(sig);
      return true;
    });
    if (deduped.length) {
      await supabaseAdmin.from("tournament_contact_candidates" as any).insert(withTid(deduped));
    }
  }
  if (venues.length) {
    const { data: existing } = await supabaseAdmin
      .from("tournament_venue_candidates" as any)
      .select("venue_name,address_text")
      .eq("tournament_id", tournamentId)
      .is("accepted_at", null)
      .is("rejected_at", null);
    const existingSig = new Set((existing ?? []).map((v: any) => [norm(v.venue_name), norm(v.address_text)].join("|")));
    const batchSig = new Set<string>();
    const deduped = venues.filter((v) => {
      const sig = [norm(v.venue_name), norm(v.address_text)].join("|");
      if (existingSig.has(sig) || batchSig.has(sig)) return false;
      batchSig.add(sig);
      return true;
    });
    if (deduped.length) {
      await supabaseAdmin.from("tournament_venue_candidates" as any).insert(withTid(deduped));
    }
  }
  if (comps.length) {
    const { data: existing } = await supabaseAdmin
      .from("tournament_referee_comp_candidates" as any)
      .select("rate_text,travel_lodging")
      .eq("tournament_id", tournamentId)
      .is("accepted_at", null)
      .is("rejected_at", null);
    const existingSig = new Set(
      (existing ?? []).map((c: any) => [norm(c.rate_text), norm(c.travel_lodging)].join("|"))
    );
    const batchSig = new Set<string>();
    const deduped = comps.filter((c) => {
      const sig = [norm(c.rate_text), norm(c.travel_lodging)].join("|");
      if (existingSig.has(sig) || batchSig.has(sig)) return false;
      batchSig.add(sig);
      return true;
    });
    if (deduped.length) {
      await supabaseAdmin.from("tournament_referee_comp_candidates" as any).insert(withTid(deduped));
    }
  }
  if (dates.length) {
    const { data: existing } = await supabaseAdmin
      .from("tournament_date_candidates" as any)
      .select("date_text,start_date,end_date")
      .eq("tournament_id", tournamentId)
      .is("accepted_at", null)
      .is("rejected_at", null);
    const existingSig = new Set(
      (existing ?? []).map((d: any) => [norm(d.date_text), d.start_date ?? "", d.end_date ?? ""].join("|"))
    );
    const batchSig = new Set<string>();
    const deduped = dates.filter((d) => {
      const sig = [norm(d.date_text), d.start_date ?? "", d.end_date ?? ""].join("|");
      if (existingSig.has(sig) || batchSig.has(sig)) return false;
      batchSig.add(sig);
      return true;
    });
    if (deduped.length) {
      await supabaseAdmin.from("tournament_date_candidates" as any).insert(withTid(deduped));
    }
  }
  if (attributes.length) {
    const { data: existing } = await supabaseAdmin
      .from("tournament_attribute_candidates" as any)
      .select("attribute_key,attribute_value,source_url")
      .eq("tournament_id", tournamentId)
      .is("accepted_at", null)
      .is("rejected_at", null);
    const existingSig = new Set(
      (existing ?? []).map((a: any) => [norm(a.attribute_key), norm(a.attribute_value), norm(a.source_url)].join("|"))
    );
    const batchSig = new Set<string>();
    const deduped = attributes.filter((a) => {
      const sig = [norm(a.attribute_key), norm(a.attribute_value), norm(a.source_url)].join("|");
      if (existingSig.has(sig) || batchSig.has(sig)) return false;
      batchSig.add(sig);
      return true;
    });
    if (deduped.length) {
      await supabaseAdmin.from("tournament_attribute_candidates" as any).insert(withTid(deduped));
    }
  }
}

async function processTournamentById(
  tournamentId: string,
  options?: { maxPages?: number; dateFocus?: boolean }
) {
  const tournamentResp = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,name,source_url,official_website_url")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tournamentResp.error) {
    throw tournamentResp.error;
  }
  const t = tournamentResp.data as any;
  const tourneyUrl = t?.official_website_url ?? t?.source_url ?? null;
  if (!tourneyUrl) {
    throw new Error("tournament_url_missing");
  }
  const scrape = await scrapeTournament(tourneyUrl, options);
  await upsertCandidates(
    tournamentId,
    scrape.contacts.slice(0, 20),
    [],
    scrape.comps.slice(0, 5),
    scrape.dates.slice(0, 5),
    scrape.attributes.slice(0, 10)
  );
  return scrape.pages;
}

async function processJob(job: JobRow, options?: { maxPages?: number; dateFocus?: boolean }) {
  return processTournamentById(job.tournament_id, options);
}

export async function runQueuedEnrichment(limit = 10, options?: { maxPages?: number; dateFocus?: boolean }) {
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
      const pages = await processJob(job, options);
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

export async function runEnrichmentForTournamentIds(
  tournamentIds: string[],
  options?: { maxPages?: number; dateFocus?: boolean }
) {
  const results: Array<{ tournament_id: string; status: string; pages: number; error?: string }> = [];
  for (const tournamentId of tournamentIds) {
    try {
      const pages = await processTournamentById(tournamentId, options);
      results.push({ tournament_id: tournamentId, status: "done", pages });
    } catch (err: any) {
      results.push({
        tournament_id: tournamentId,
        status: "error",
        pages: 0,
        error: err?.message ?? "unknown_error",
      });
    }
  }
  return results;
}

export async function queueEnrichmentJobs(tournamentIds: string[]) {
  if (!tournamentIds.length) return { inserted: 0 };
  // Filter out tournaments that are marked to skip.
  const { data: allowed, error: fetchErr } = await supabaseAdmin
    .from("tournaments" as any)
    .select("id")
    .in("id", tournamentIds)
    .eq("enrichment_skip", false);
  if (fetchErr) throw fetchErr;
  const rows = (allowed ?? []).map((t: any) => ({ tournament_id: t.id, status: "queued" }));
  if (!rows.length) return { inserted: 0 };
  const resp = await supabaseAdmin.from("tournament_enrichment_jobs" as any).insert(rows);
  if (resp.error && resp.error.code !== "23505") {
    // 23505 = unique violation (duplicate queued/running job); ignore to keep idempotent
    throw resp.error;
  }
  return { inserted: rows.length };
}
