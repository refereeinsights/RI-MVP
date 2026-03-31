import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

type DraftRow = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  official_website_url: string | null;
  source_url: string | null;
  venue: string | null;
  address: string | null;
  venue_url: string | null;
};

type VenueCandidateInsert = {
  tournament_id: string;
  venue_name: string | null;
  address_text: string;
  venue_url: string | null;
  source_url: string | null;
  evidence_text: string | null;
  confidence: number | null;
};

type AttrCandidateInsert = {
  tournament_id: string;
  attribute_key: "address" | "venue_url";
  attribute_value: string;
  source_url: string | null;
  evidence_text: string | null;
  confidence: number | null;
};

const HELP = process.argv.includes("--help") || process.argv.includes("-h");
const APPLY = process.argv.includes("--apply");

const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : 50;
const OFFSET_ARG = process.argv.find((arg) => arg.startsWith("--offset="));
const OFFSET = OFFSET_ARG ? Number(OFFSET_ARG.split("=")[1]) : 0;

function loadEnvLocalIfMissing() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2] || "";
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function printHelp() {
  console.log(
    [
      "Scan draft tournament uploads missing venues and insert venue/address candidates.",
      "",
      "Usage:",
      "  TMPDIR=./tmp node --import tsx scripts/ops/scan_draft_upload_venues.ts [--limit=50] [--offset=0]",
      "  TMPDIR=./tmp node --import tsx scripts/ops/scan_draft_upload_venues.ts --apply [--limit=50] [--offset=0]",
      "",
      "Env required:",
      "  NEXT_PUBLIC_SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
    ].join("\n")
  );
}

function clean(value: unknown) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : "";
}

function isBlank(value: unknown) {
  return !clean(value);
}

function normalizeAddressForBlocklist(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlockedOrganizerAddress(value: unknown) {
  const normalized = normalizeAddressForBlocklist(value);
  if (!normalized) return false;
  // Organizer mailing address that gets misclassified as a venue.
  return normalized.includes("1529") && (normalized.includes("3rd") || normalized.includes("third")) && normalized.includes("32250");
}

function nowIso() {
  return new Date().toISOString();
}

function buildOutPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join("/tmp", `ri_draft_upload_venue_scan_${stamp}.csv`);
}

function toCsvRow(values: Record<string, string>) {
  const cols = Object.keys(values);
  const esc = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return cols.map((c) => esc(values[c] ?? "")).join(",");
}

function normalizeUrl(raw: string, base: URL): string | null {
  try {
    const url = new URL(raw, base);
    if (!/^https?:$/i.test(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  const input = clean(url);
  if (!input) return null;
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }
  if (!/^https?:$/i.test(parsed.protocol)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const resp = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      cache: "no-cache",
      signal: controller.signal,
      headers: { "user-agent": "RI-DraftVenueScan/1.0", accept: "text/html,application/xhtml+xml" },
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) return null;
    const html = await resp.text();
    if (!html) return null;
    return html.slice(0, 1024 * 1024);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractJsonLdLocation($: cheerio.CheerioAPI): Array<{ venue_name: string | null; address_text: string | null; venue_url: string | null }> {
  const out: Array<{ venue_name: string | null; address_text: string | null; venue_url: string | null }> = [];
  const scripts = $("script[type='application/ld+json']").toArray().slice(0, 16);

  const toAddressText = (addr: any): string | null => {
    if (!addr) return null;
    if (typeof addr === "string") {
      const cleaned = clean(addr);
      return cleaned.length >= 6 ? cleaned : null;
    }
    if (typeof addr !== "object") return null;
    const street = clean(addr.streetAddress ?? "");
    const city = clean(addr.addressLocality ?? "");
    const state = clean(addr.addressRegion ?? "");
    const zip = clean(addr.postalCode ?? "");
    const parts = [street, [city, state].filter(Boolean).join(", "), zip].filter(Boolean);
    const joined = clean(parts.join(" "));
    return joined.length >= 6 ? joined : null;
  };

  const visit = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== "object") return;
    const typeRaw = node["@type"] ?? null;
    const type = Array.isArray(typeRaw) ? typeRaw.join(" ").toLowerCase() : String(typeRaw ?? "").toLowerCase();
    const isEventish = type.includes("event") || type.includes("sports");
    if (isEventish && node.location && typeof node.location === "object") visit(node.location);
    if (node.address) {
      const address_text = toAddressText(node.address);
      if (address_text) {
        out.push({
          venue_name: clean(node.name) || null,
          address_text,
          venue_url: clean(node.url) || null,
        });
      }
    }
    for (const k of Object.keys(node)) {
      if (k === "address" || k === "location") continue;
      const v = node[k];
      if (typeof v === "object") visit(v);
    }
  };

  for (const el of scripts) {
    const raw = clean($(el).contents().text() || "");
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      visit(parsed);
    } catch {
      // ignore
    }
    if (out.length >= 12) break;
  }
  return out.slice(0, 12);
}

function extractFullAddresses(text: string): string[] {
  const pattern =
    /\d{1,5}\s+[A-Za-z0-9.'\-#\s]{3,100},\s*[A-Za-z.'\s]{2,60},\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?/g;
  return Array.from(new Set(Array.from(text.matchAll(pattern)).map((m) => clean(m[0] ?? "")).filter(Boolean))).slice(0, 12);
}

function looksLikeFullAddressLine(value: string) {
  const v = clean(value);
  if (!v) return false;
  // Requires a comma-separated street prefix plus a city/state/zip-ish suffix.
  // Handles: "..., Mesa, AZ 85201" and "..., Mesa AZ 85207".
  return /,\s*[^,]{2,60}\s*,?\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?\b/.test(v);
}

function splitVenueNameAndAddress(value: string): { venueName: string | null; addressText: string | null } {
  const v = clean(value);
  if (!v) return { venueName: null, addressText: null };
  const idx = v.search(/\b\d{1,5}\s+[A-Za-z0-9]/);
  if (idx <= 0) return { venueName: null, addressText: looksLikeFullAddressLine(v) ? v : null };
  const venueNameRaw = v.slice(0, idx).replace(/[\s\-–:.,]+$/g, "").trim();
  const addressTextRaw = v.slice(idx).trim();
  return {
    venueName: venueNameRaw.length >= 2 ? venueNameRaw : null,
    addressText: addressTextRaw.length ? addressTextRaw : null,
  };
}

function extractLinkedVenueAddressCandidates(
  $: cheerio.CheerioAPI,
  args: { tournament_id: string; baseUrl: string; source_url: string; max?: number }
): VenueCandidateInsert[] {
  const max = Math.max(1, Math.min(args.max ?? 12, 25));
  const out: VenueCandidateInsert[] = [];
  $("a[href]").each((_idx, el) => {
    if (out.length >= max) return;
    const anchorText = clean($(el).text() || "");
    if (!anchorText) return;
    if (!looksLikeFullAddressLine(anchorText)) return;
    const { venueName, addressText } = splitVenueNameAndAddress(anchorText);
    if (!addressText) return;
    const href = clean($(el).attr("href") || "");
    const venueUrl = href && !/\.pdf(\?|#|$)/i.test(href) ? href : null;
    out.push({
      tournament_id: args.tournament_id,
      venue_name: venueName,
      address_text: addressText,
      venue_url: venueUrl,
      source_url: args.source_url,
      evidence_text: "fields-link",
      confidence: 0.85,
    });
  });
  return out;
}

function extractMapLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const out = new Set<string>();
  $("a[href]").each((_idx, el) => {
    const hrefRaw = ($(el).attr("href") || "").trim();
    if (!hrefRaw) return;
    const lower = hrefRaw.toLowerCase();
    if (!/google\.com\/maps|maps\.apple|waze\.com/i.test(lower)) return;
    const abs = normalizeUrl(hrefRaw, base);
    if (!abs) return;
    out.add(abs);
  });
  return Array.from(out).slice(0, 8);
}

function extractVenueLikeLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const out = new Set<string>();
  const keyword = /(venues?|locations?|fields?|facility|facilities|complex|park|directions?|maps?)/i;
  $("a[href]").each((_idx, el) => {
    const hrefRaw = ($(el).attr("href") || "").trim();
    if (!hrefRaw) return;
    const anchorText = clean($(el).text() || "");
    if (!keyword.test(`${hrefRaw} ${anchorText}`)) return;
    const abs = normalizeUrl(hrefRaw, base);
    if (!abs) return;
    try {
      const parsed = new URL(abs);
      if (parsed.hostname !== base.hostname) return;
      out.add(abs);
    } catch {
      return;
    }
  });
  return Array.from(out).slice(0, 4);
}

async function main() {
  if (HELP) {
    printHelp();
    return;
  }

  loadEnvLocalIfMissing();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  if (!Number.isFinite(LIMIT) || LIMIT <= 0) throw new Error("--limit must be positive");
  if (!Number.isFinite(OFFSET) || OFFSET < 0) throw new Error("--offset must be >= 0");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: draftsRaw, error: draftsErr } = await supabase
    .from("tournaments" as any)
    .select("id,name,city,state,official_website_url,source_url,venue,address,venue_url")
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (draftsErr) throw new Error(draftsErr.message);
  const allDrafts = (draftsRaw ?? []) as DraftRow[];

  // Focus on drafts that have no venue/address and no tournament_venues links.
  const draftIds = allDrafts.map((d) => String(d.id ?? "")).filter(Boolean);
  const linked = new Set<string>();
  for (let i = 0; i < draftIds.length; i += 50) {
    const chunk = draftIds.slice(i, i + 50);
    const { data } = await supabase.from("tournament_venues" as any).select("tournament_id").in("tournament_id", chunk).limit(20000);
    for (const row of (data ?? []) as Array<{ tournament_id: string | null }>) {
      const tid = String(row.tournament_id ?? "");
      if (tid) linked.add(tid);
    }
  }

  const targets = allDrafts
    .filter((d) => !linked.has(d.id))
    .filter((d) => isBlank(d.venue) && isBlank(d.address))
    .slice(OFFSET, OFFSET + LIMIT);

  const outPath = buildOutPath();
  const report: Array<Record<string, string>> = [];

  let scanned = 0;
  let fetched = 0;
  let foundAny = 0;
  let venueCandidatesInserted = 0;
  let attrCandidatesInserted = 0;

  for (const draft of targets) {
    scanned += 1;
    const seedUrl = clean(draft.official_website_url) || clean(draft.source_url);
    if (!seedUrl) continue;

    const html = await fetchHtml(seedUrl);
    if (!html) {
      report.push({
        tournament_id: draft.id,
        name: clean(draft.name) || draft.id,
        url: seedUrl,
        status: "fetch_failed",
        found: "",
        inserted_venue_candidates: "0",
        inserted_attr_candidates: "0",
      });
      continue;
    }
    fetched += 1;

    const $ = cheerio.load(html);
    const candidates: VenueCandidateInsert[] = [];
    const attrs: AttrCandidateInsert[] = [];

    // JSON-LD location signals.
    for (const loc of extractJsonLdLocation($)) {
      const address_text = clean(loc.address_text);
      if (!address_text) continue;
      candidates.push({
        tournament_id: draft.id,
        venue_name: loc.venue_name ? clean(loc.venue_name) : null,
        address_text,
        venue_url: loc.venue_url ? clean(loc.venue_url) : null,
        source_url: seedUrl,
        evidence_text: "json-ld",
        confidence: 0.85,
      });
    }

    // Full addresses on-page.
    candidates.push(
      ...extractLinkedVenueAddressCandidates($, {
        tournament_id: draft.id,
        baseUrl: seedUrl,
        source_url: seedUrl,
        max: 12,
      })
    );
    for (const addr of extractFullAddresses($.text() || "")) {
      candidates.push({
        tournament_id: draft.id,
        venue_name: null,
        address_text: addr,
        venue_url: null,
        source_url: seedUrl,
        evidence_text: "page-text-address",
        confidence: 0.7,
      });
    }

    // Map links on seed page.
    for (const link of extractMapLinks($, seedUrl)) {
      attrs.push({
        tournament_id: draft.id,
        attribute_key: "venue_url",
        attribute_value: link,
        source_url: seedUrl,
        evidence_text: "map-link",
        confidence: 0.6,
      });
    }

    // Follow up to 2 venue-ish internal pages if we still have no address candidates.
    const toFollow = candidates.length ? [] : extractVenueLikeLinks($, seedUrl).slice(0, 2);
    for (const nextUrl of toFollow) {
      const html2 = await fetchHtml(nextUrl);
      if (!html2) continue;
      const $2 = cheerio.load(html2);
      for (const loc of extractJsonLdLocation($2)) {
        const address_text = clean(loc.address_text);
        if (!address_text) continue;
        candidates.push({
          tournament_id: draft.id,
          venue_name: loc.venue_name ? clean(loc.venue_name) : null,
          address_text,
          venue_url: loc.venue_url ? clean(loc.venue_url) : null,
          source_url: nextUrl,
          evidence_text: "json-ld",
          confidence: 0.85,
        });
      }
      candidates.push(
        ...extractLinkedVenueAddressCandidates($2, {
          tournament_id: draft.id,
          baseUrl: nextUrl,
          source_url: nextUrl,
          max: 12,
        })
      );
      for (const addr of extractFullAddresses($2.text() || "")) {
        candidates.push({
          tournament_id: draft.id,
          venue_name: null,
          address_text: addr,
          venue_url: null,
          source_url: nextUrl,
          evidence_text: "page-text-address",
          confidence: 0.7,
        });
      }
      for (const link of extractMapLinks($2, nextUrl)) {
        attrs.push({
          tournament_id: draft.id,
          attribute_key: "venue_url",
          attribute_value: link,
          source_url: nextUrl,
          evidence_text: "map-link",
          confidence: 0.6,
        });
      }
      if (candidates.length) break;
    }

    // Promote a best address into attribute candidates too (helps the existing apply tooling).
    const best = candidates
      .slice()
      .sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0))[0];
    if (best?.address_text && !isBlockedOrganizerAddress(best.address_text)) {
      attrs.push({
        tournament_id: draft.id,
        attribute_key: "address",
        attribute_value: best.address_text,
        source_url: best.source_url ?? seedUrl,
        evidence_text: best.evidence_text,
        confidence: best.confidence,
      });
    }

    const filteredCandidates = candidates.filter((c) => !isBlockedOrganizerAddress(c.address_text));
    const filteredAttrs = attrs.filter((a) => a.attribute_key !== "address" || !isBlockedOrganizerAddress(a.attribute_value));

    const dedupeKey = (c: VenueCandidateInsert) =>
      `${clean(c.venue_name).toLowerCase()}|${clean(c.address_text).toLowerCase()}|${clean(c.venue_url).toLowerCase()}|${clean(c.source_url).toLowerCase()}`;
    const dedupedCandidates = Array.from(new Map(filteredCandidates.map((c) => [dedupeKey(c), c])).values()).slice(0, 12);
    const dedupeAttrKey = (a: AttrCandidateInsert) =>
      `${a.attribute_key}|${clean(a.attribute_value).toLowerCase()}|${clean(a.source_url).toLowerCase()}`;
    const dedupedAttrs = Array.from(new Map(filteredAttrs.map((a) => [dedupeAttrKey(a), a])).values()).slice(0, 12);

    let insertError: string | null = null;
    let insertedVenueCount = 0;
    let insertedAttrCount = 0;

    const foundTags: string[] = [];
    if (dedupedCandidates.length) foundTags.push("venue_candidates");
    if (dedupedAttrs.some((a) => a.attribute_key === "address")) foundTags.push("address_attr");
    if (dedupedAttrs.some((a) => a.attribute_key === "venue_url")) foundTags.push("venue_url_attr");
    if (foundTags.length) foundAny += 1;

    if (APPLY) {
      if (dedupedCandidates.length) {
        const sourceUrls = Array.from(new Set(dedupedCandidates.map((c) => clean(c.source_url)).filter(Boolean)));
        const { data: existing, error: existingErr } = await supabase
          .from("tournament_venue_candidates" as any)
          .select("venue_name,address_text,source_url")
          .eq("tournament_id", draft.id)
          .in("source_url", sourceUrls.length ? sourceUrls : [seedUrl])
          .limit(20000);
        if (existingErr) {
          insertError = `existing_venue_candidates_lookup_failed: ${existingErr.message}`;
        } else {
          const sig = new Set(
            ((existing ?? []) as any[]).map((r) => {
              const name = clean(r?.venue_name)?.toLowerCase() ?? "";
              const addr = clean(r?.address_text)?.toLowerCase() ?? "";
              const src = clean(r?.source_url) ?? "";
              return `${name}|${addr}|${src}`;
            })
          );
          const toInsert = dedupedCandidates.filter((c) => {
            const name = clean(c.venue_name)?.toLowerCase() ?? "";
            const addr = clean(c.address_text)?.toLowerCase() ?? "";
            const src = clean(c.source_url) ?? "";
            return !sig.has(`${name}|${addr}|${src}`);
          });
          if (toInsert.length) {
            const { error } = await supabase.from("tournament_venue_candidates" as any).insert(toInsert);
            if (error) insertError = `insert_venue_candidates_failed: ${error.message}`;
            else {
              venueCandidatesInserted += toInsert.length;
              insertedVenueCount = toInsert.length;
            }
          }
        }
      }
      if (dedupedAttrs.length) {
        const sourceUrls = Array.from(new Set(dedupedAttrs.map((a) => clean(a.source_url)).filter(Boolean)));
        const { data: existing, error: existingErr } = await supabase
          .from("tournament_attribute_candidates" as any)
          .select("attribute_key,attribute_value,source_url")
          .eq("tournament_id", draft.id)
          .in("source_url", sourceUrls.length ? sourceUrls : [seedUrl])
          .limit(20000);
        if (existingErr) {
          insertError = insertError ? `${insertError}; existing_attr_candidates_lookup_failed: ${existingErr.message}` : `existing_attr_candidates_lookup_failed: ${existingErr.message}`;
        } else {
          const sig = new Set(
            ((existing ?? []) as any[]).map((r) => {
              const key = clean(r?.attribute_key)?.toLowerCase() ?? "";
              const val = clean(r?.attribute_value)?.toLowerCase() ?? "";
              const src = clean(r?.source_url) ?? "";
              return `${key}|${val}|${src}`;
            })
          );
          const toInsert = dedupedAttrs.filter((a) => {
            const key = clean(a.attribute_key)?.toLowerCase() ?? "";
            const val = clean(a.attribute_value)?.toLowerCase() ?? "";
            const src = clean(a.source_url) ?? "";
            return !sig.has(`${key}|${val}|${src}`);
          });
          if (toInsert.length) {
            const { error } = await supabase.from("tournament_attribute_candidates" as any).insert(toInsert);
            if (error) insertError = insertError ? `${insertError}; insert_attr_candidates_failed: ${error.message}` : `insert_attr_candidates_failed: ${error.message}`;
            else {
              attrCandidatesInserted += toInsert.length;
              insertedAttrCount = toInsert.length;
            }
          }
        }
      }
    }

    report.push({
      tournament_id: draft.id,
      name: clean(draft.name) || draft.id,
      url: seedUrl,
      status: insertError ? "insert_error" : "ok",
      found: foundTags.join("|"),
      inserted_venue_candidates: APPLY ? String(insertedVenueCount) : "0",
      inserted_attr_candidates: APPLY ? String(insertedAttrCount) : "0",
      ...(insertError ? { error: insertError.slice(0, 220) } : {}),
    });
  }

  const header = Object.keys({
    tournament_id: "",
    name: "",
    url: "",
    status: "",
    found: "",
    inserted_venue_candidates: "",
    inserted_attr_candidates: "",
    error: "",
  });
  const lines = [header.join(",")];
  for (const row of report) {
    lines.push(
      toCsvRow({
        tournament_id: row.tournament_id ?? "",
        name: row.name ?? "",
        url: row.url ?? "",
        status: row.status ?? "",
        found: row.found ?? "",
        inserted_venue_candidates: row.inserted_venue_candidates ?? "",
        inserted_attr_candidates: row.inserted_attr_candidates ?? "",
        error: (row as any).error ?? "",
      })
    );
  }
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");

  console.log("");
  console.log("Done.");
  console.log(`- apply: ${APPLY ? "yes" : "no"}`);
  console.log(`- scanned: ${scanned}`);
  console.log(`- fetched: ${fetched}`);
  console.log(`- found_any: ${foundAny}`);
  console.log(`- inserted_venue_candidates: ${venueCandidatesInserted}`);
  console.log(`- inserted_attr_candidates: ${attrCandidatesInserted}`);
  console.log(`- csv: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
