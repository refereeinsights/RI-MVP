/*
 * Cal South Referee Associations ingestion (assignor_type = association)
 *
 * Usage:
 *   npx tsx scripts/ingest/calsouth_referee_associations.ts
 */

import { load as cheerioLoad } from "cheerio";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "../../apps/referee/lib/supabaseAdmin";

const SOURCE_URL = "https://calsouth.com/referee-associations/";
const SOURCE_NAME = "Cal South Referee Associations Directory";
const DEFAULT_STATE = "CA";
const DEFAULT_SPORT = "soccer";
const ASSIGNOR_TYPE = "association";

type AssociationRecord = {
  name: string;
  website_url: string | null;
  address_text: string | null;
  meeting_location_text: string | null;
  coverage_areas: string | null;
  contact_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  city: string | null;
  raw_source_text: string;
  source_hash: string;
};

type SourceRecordRow = {
  id: string;
  external_id: string;
  review_status: string | null;
  raw: Record<string, any> | null;
};

function normalizeText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function normalizeKey(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hashValue(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function splitLines(text: string) {
  return text
    .split(/\r?\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractEmails(text: string) {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase())));
}

function extractPhones(text: string) {
  const matches = text.match(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || [];
  return Array.from(new Set(matches.map((m) => m.replace(/\s+/g, " ").trim())));
}

function pickAddress(lines: string[]) {
  const addressKeywords = ["st", "street", "ave", "avenue", "road", "rd", "blvd", "boulevard", "suite", "ste", "drive", "dr", "lane", "ln"];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/\d/.test(lower) && addressKeywords.some((k) => lower.includes(` ${k}`))) {
      return line;
    }
  }
  return null;
}

function pickMeetingLocation(lines: string[]) {
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("meeting") || lower.includes("meets") || lower.includes("location")) {
      return line;
    }
  }
  return null;
}

function pickCoverage(lines: string[]) {
  const coverageLines = lines.filter((line) => {
    const lower = line.toLowerCase();
    return (
      lower.includes("coverage") ||
      lower.includes("serves") ||
      lower.includes("area") ||
      lower.includes("counties") ||
      lower.includes("cities")
    );
  });
  if (!coverageLines.length) return null;
  return coverageLines.join(" ");
}

function parseContact(lines: string[], rawText: string, links: string[]) {
  let contactRole: string | null = null;
  let contactName: string | null = null;

  for (const line of lines) {
    const parts = line.split(":");
    if (parts.length < 2) continue;
    const label = parts[0].toLowerCase();
    if (
      label.includes("contact") ||
      label.includes("assignor") ||
      label.includes("administrator") ||
      label.includes("president") ||
      label.includes("director") ||
      label.includes("secretary")
    ) {
      contactRole = normalizeText(parts[0]);
      const value = parts.slice(1).join(":").trim();
      if (value) {
        contactName = value;
      }
      break;
    }
  }

  const mailtoEmails = links
    .filter((href) => href.startsWith("mailto:"))
    .map((href) => href.replace(/^mailto:/i, "").split("?")[0].trim())
    .filter(Boolean);
  const emails = Array.from(new Set([...extractEmails(rawText), ...mailtoEmails]));
  const phones = extractPhones(rawText);
  const email = emails[0] ?? null;
  const phone = phones[0] ?? null;

  if (contactName) {
    if (email) contactName = contactName.replace(email, "").trim();
    if (phone) contactName = contactName.replace(phone, "").trim();
    contactName = contactName.replace(/[-–—]$/, "").trim() || null;
  }

  return {
    contact_name: contactName,
    contact_role: contactRole,
    contact_email: email,
    contact_phone: phone,
  };
}

function parseCity(text: string) {
  const match = text.match(/([A-Za-z\\s]+),\\s*CA\\b/);
  return match?.[1]?.trim() ?? null;
}

function extractAssociations(html: string): AssociationRecord[] {
  const $ = cheerioLoad(html);
  const records: AssociationRecord[] = [];

  const items = $(".elementor-toggle-item").toArray();
  items.forEach((item) => {
    const node = $(item);
    const name = normalizeText(node.find(".elementor-toggle-title").first().text());
    if (!name) return;

    const contentNode = node.find(".elementor-tab-content").first();
    const linkList = contentNode
      .find("a[href]")
      .toArray()
      .map((el) => $(el).attr("href") || "")
      .filter(Boolean);
    const rawText = normalizeText([contentNode.text(), linkList.join(" ")].join(" "));
    if (!rawText) return;

    const lines = splitLines(contentNode.text());
    const links = linkList;
    const website = links.find((href) => href.startsWith("http")) || null;

    const coverage = pickCoverage(lines);
    const address = pickAddress(lines);
    const meeting = pickMeetingLocation(lines);
    const contact = parseContact(lines, rawText, links);
    const city = parseCity(rawText) ?? parseCity(address ?? "") ?? null;

    const normalizedBlock = normalizeText([name, rawText].join(" "));
    const sourceHash = hashValue(normalizedBlock);

    records.push({
      name,
      website_url: website,
      address_text: address,
      meeting_location_text: meeting,
      coverage_areas: coverage,
      contact_name: contact.contact_name,
      contact_role: contact.contact_role,
      contact_email: contact.contact_email,
      contact_phone: contact.contact_phone,
      city,
      raw_source_text: rawText,
      source_hash: sourceHash,
    });
  });

  return records;
}

async function ensureSourceId() {
  const { data: existing, error } = await supabaseAdmin
    .from("assignor_sources" as any)
    .select("id")
    .eq("source_url", SOURCE_URL)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to lookup assignor source: ${error.message}`);
  }
  if (existing?.id) return existing.id as string;

  const { data: created, error: insertError } = await supabaseAdmin
    .from("assignor_sources" as any)
    .insert({
      source_name: SOURCE_NAME,
      source_url: SOURCE_URL,
      default_sport: DEFAULT_SPORT,
      default_state: DEFAULT_STATE,
      is_active: true,
    })
    .select("id")
    .single();

  if (insertError || !created?.id) {
    throw new Error(`Failed to create assignor source: ${insertError?.message ?? "unknown error"}`);
  }
  return created.id as string;
}

function buildExternalId(record: AssociationRecord) {
  const websitePart = record.website_url ? normalizeKey(record.website_url) : "";
  const key = [normalizeKey(record.name), DEFAULT_STATE, websitePart].filter(Boolean).join("|");
  return `calsouth_${hashValue(key)}`;
}

function buildRawPayload(record: AssociationRecord) {
  return {
    name: record.name,
    email: record.contact_email,
    phone: record.contact_phone,
    assignor_type: ASSIGNOR_TYPE,
    sport: DEFAULT_SPORT,
    state: DEFAULT_STATE,
    city: record.city,
    coverage_areas: record.coverage_areas,
    website_url: record.website_url,
    contact_name: record.contact_name,
    contact_role: record.contact_role,
    contact_email: record.contact_email,
    contact_phone: record.contact_phone,
    meeting_location_text: record.meeting_location_text,
    address_text: record.address_text,
    source_name: SOURCE_NAME,
    source_url: SOURCE_URL,
    verification_status: "unclaimed",
    review_status: "needs_review",
    ingest_method: "scraped",
    last_ingested_at: new Date().toISOString(),
    source_hash: record.source_hash,
    raw_source_text: record.raw_source_text,
  };
}

async function fetchPage() {
  const response = await fetch(
    "https://calsouth.com/wp-json/wp/v2/pages?slug=referee-associations",
    { redirect: "follow" }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch Cal South page JSON: HTTP ${response.status}`);
  }
  const json = (await response.json()) as Array<{ content?: { rendered?: string } }> | null;
  const page = Array.isArray(json) ? json[0] : null;
  const content = page?.content?.rendered ?? "";
  if (!content) {
    throw new Error("Cal South page content missing in WP REST payload.");
  }
  return content;
}

async function run() {
  const html = await fetchPage();
  const records = extractAssociations(html);
  const forceUpdate = process.env.FORCE_UPDATE === "true";

  const sourceId = await ensureSourceId();
  const externalIds = records.map(buildExternalId);

  const { data: existingRows } = externalIds.length
    ? await supabaseAdmin
        .from("assignor_source_records" as any)
        .select("id,external_id,review_status,raw")
        .eq("source_id", sourceId)
        .in("external_id", externalIds)
    : { data: [] as SourceRecordRow[] };

  const existingMap = new Map<string, SourceRecordRow>();
  (existingRows ?? []).forEach((row: any) => {
    if (row?.external_id) existingMap.set(String(row.external_id), row as SourceRecordRow);
  });

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let needsReview = 0;

  for (const record of records) {
    const externalId = buildExternalId(record);
    const raw = buildRawPayload(record);
    const existing = existingMap.get(externalId);

    if (!existing) {
      const { error } = await supabaseAdmin.from("assignor_source_records" as any).insert({
        source_id: sourceId,
        external_id: externalId,
        raw,
        confidence: 70,
        review_status: "needs_review",
      });
      if (error) {
        // eslint-disable-next-line no-console
        console.error("Insert failed", externalId, error.message);
        continue;
      }
      inserted += 1;
      needsReview += 1;
      continue;
    }

    const existingHash = String(existing.raw?.source_hash ?? "");
    const existingEmail = (existing.raw as any)?.email ?? null;
    const existingPhone = (existing.raw as any)?.phone ?? null;
    const missingContact =
      (!existingEmail && record.contact_email) || (!existingPhone && record.contact_phone);
    if (!forceUpdate && existingHash && existingHash === record.source_hash && !missingContact) {
      skipped += 1;
      if (existing.review_status === "needs_review") needsReview += 1;
      continue;
    }

    const updatePayload: Record<string, any> = { raw, confidence: 70 };
    const { error } = await supabaseAdmin
      .from("assignor_source_records" as any)
      .update(updatePayload)
      .eq("id", existing.id);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Update failed", externalId, error.message);
      continue;
    }
    updated += 1;
    if (existing.review_status === "needs_review") needsReview += 1;
  }

  const summary = {
    total_found: records.length,
    inserted,
    updated,
    skipped,
    needs_review: needsReview,
  };

  // eslint-disable-next-line no-console
  console.log("[calsouth] ingestion summary", summary);
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[calsouth] ingestion failed", err);
  process.exit(1);
});
