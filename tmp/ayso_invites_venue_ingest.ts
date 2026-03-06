import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

type CsvRow = {
  tournament_id: string;
  tournament_name: string;
  tournament_slug: string;
  base_url: string;
  invite_url: string;
  match_type: string;
};

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractAddresses(text: string): string[] {
  const pattern = /\d{1,5}\s+[A-Za-z0-9.\-#\s]{3,100},\s*[A-Za-z.\s]{2,60},\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?/g;
  const matches = Array.from(text.matchAll(pattern)).map((m) => normalizeSpace(m[0] ?? ''));
  return Array.from(new Set(matches.filter(Boolean)));
}

function extractStreetLike(text: string): string | null {
  const pattern = /\d{1,5}\s+[A-Za-z0-9.'#\-\s]{2,90}\b(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pkwy|Parkway|Pl|Place|Cir|Circle|Ter|Terrace|Highway|Hwy)\b\.?/i;
  const m = text.match(pattern);
  return m ? normalizeSpace(m[0]) : null;
}

function cleanVenueName(raw: string): string | null {
  const text = normalizeSpace(raw)
    .replace(/\b(address|location|directions?)\b[:\-]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!text) return null;
  if (text.length < 3 || text.length > 120) return null;
  if (/^\d/.test(text)) return null;
  return text;
}

function extractVenueEntriesFromPage(
  $: cheerio.CheerioAPI,
  locality: { city: string; state: string; zip: string } | null
): Array<{ venue_name: string | null; address_text: string }> {
  const entries: Array<{ venue_name: string | null; address_text: string }> = [];
  const dedupe = new Set<string>();

  const nodes = $('li, tr, p, div').toArray().slice(0, 1200);

  for (const node of nodes) {
    const text = normalizeSpace($(node).text() || '');
    if (!text) continue;

    const fullAddresses = extractAddresses(text);
    const partialStreet = fullAddresses.length ? null : extractStreetLike(text);
    const localitySuffix = locality ? `${locality.city}, ${locality.state} ${locality.zip}` : null;
    const addresses = fullAddresses.length
      ? fullAddresses
      : partialStreet && localitySuffix
      ? [`${partialStreet}, ${localitySuffix}`]
      : [];
    if (!addresses.length) continue;

    const rowHeading =
      cleanVenueName($(node).find('strong,h3,h4,b').first().text() || '') ??
      cleanVenueName(text.split(/[|•]/)[0] || '');

    for (const address of addresses) {
      const key = `${(rowHeading ?? '').toLowerCase()}|${address.toLowerCase()}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      entries.push({ venue_name: rowHeading, address_text: address });
    }
  }

  return entries;
}

function detectVenuePageUrl(currentUrl: string, $: cheerio.CheerioAPI): string | null {
  try {
    const selfPath = new URL(currentUrl).pathname.toLowerCase();
    if (/(^|\/)(venue|venues|location|locations)(\/|$)/.test(selfPath)) return currentUrl;
  } catch {}

  const anchors = $('a[href]');
  for (const el of anchors) {
    const href = ($(el).attr('href') || '').trim();
    if (!href) continue;
    if (/(^|\/)(venue|venues|location|locations|field|fields|directions)(\/|$)/i.test(href)) {
      try {
        return new URL(href, currentUrl).toString();
      } catch {
        continue;
      }
    }
  }
  return null;
}

async function fetchHtml(url: string): Promise<{ finalUrl: string; html: string | null }> {
  try {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-cache',
      headers: { 'user-agent': 'RI-AYSO-Venue-Invite-Ingest/1.0' },
    });
    if (!resp.ok) return { finalUrl: resp.url || url, html: null };
    const contentType = resp.headers.get('content-type') ?? '';
    if (!/text\/html/i.test(contentType)) return { finalUrl: resp.url || url, html: null };
    return { finalUrl: resp.url || url, html: await resp.text() };
  } catch {
    return { finalUrl: url, html: null };
  }
}

function parseCsv(filePath: string): CsvRow[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(',');
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const vals: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      const next = line[j + 1];
      if (ch === '"') {
        if (inQuotes && next === '"') {
          cur += '"';
          j++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        vals.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    vals.push(cur);

    const row: any = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] ?? '';
    });
    rows.push(row as CsvRow);
  }

  return rows;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) throw new Error('Missing Supabase env vars');
  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const csvPath = path.join(process.cwd(), 'tmp', 'reports', `ayso_invitation_links_${stamp}.csv`);
  if (!fs.existsSync(csvPath)) throw new Error(`CSV not found: ${csvPath}`);

  const csvRows = parseCsv(csvPath).filter((r) => r.match_type !== 'pdf-link');
  const tournamentIds = [...new Set(csvRows.map((r) => r.tournament_id))];
  const { data: tournaments, error } = await supabase
    .from('tournaments')
    .select('id,city,state,zip')
    .in('id', tournamentIds);
  if (error) throw new Error(error.message);
  const localityByTid = new Map<string, { city: string; state: string; zip: string }>();
  for (const t of (tournaments ?? []) as any[]) {
    if (t?.city && t?.state && t?.zip) localityByTid.set(t.id, { city: t.city, state: t.state, zip: t.zip });
  }

  let inserted = 0;
  let scannedPages = 0;

  for (const row of csvRows) {
    const locality = localityByTid.get(row.tournament_id) ?? null;

    const main = await fetchHtml(row.invite_url);
    if (!main.html) continue;
    scannedPages += 1;

    const $main = cheerio.load(main.html);
    const venuePageUrl = detectVenuePageUrl(main.finalUrl || row.invite_url, $main);
    const venueSources: Array<{ url: string; $: cheerio.CheerioAPI }> = [{ url: main.finalUrl || row.invite_url, $: $main }];

    if (venuePageUrl && venuePageUrl !== (main.finalUrl || row.invite_url)) {
      const venuePage = await fetchHtml(venuePageUrl);
      if (venuePage.html) {
        venueSources.push({ url: venuePage.finalUrl || venuePageUrl, $: cheerio.load(venuePage.html) });
        scannedPages += 1;
      }
    }

    const candidates: Array<any> = [];
    for (const source of venueSources) {
      const entries = extractVenueEntriesFromPage(source.$, locality);
      for (const entry of entries) {
        candidates.push({
          tournament_id: row.tournament_id,
          venue_name: entry.venue_name,
          address_text: entry.address_text,
          venue_url: null,
          source_url: source.url,
          evidence_text: 'AYSO invite venue ingest',
          confidence: 0.8,
        });
      }
    }

    if (!candidates.length) continue;

    const { data: existing } = await supabase
      .from('tournament_venue_candidates')
      .select('venue_name,address_text,source_url')
      .eq('tournament_id', row.tournament_id)
      .is('accepted_at', null)
      .is('rejected_at', null);

    const sig = new Set((existing ?? []).map((e: any) => `${(e.venue_name ?? '').toLowerCase()}|${(e.address_text ?? '').toLowerCase()}|${(e.source_url ?? '').toLowerCase()}`));
    const toInsert = candidates.filter((c) => {
      const s = `${(c.venue_name ?? '').toLowerCase()}|${(c.address_text ?? '').toLowerCase()}|${(c.source_url ?? '').toLowerCase()}`;
      if (sig.has(s)) return false;
      sig.add(s);
      return true;
    });

    if (toInsert.length) {
      const { error: insErr } = await supabase.from('tournament_venue_candidates').insert(toInsert as any);
      if (!insErr) inserted += toInsert.length;
    }
  }

  const summaryPath = path.join(process.cwd(), 'tmp', 'reports', `ayso_invitation_venue_ingest_summary_${stamp}.json`);
  const summary = {
    generated_at: new Date().toISOString(),
    source_csv: csvPath,
    html_rows_considered: csvRows.length,
    scanned_pages: scannedPages,
    inserted_tournament_venue_candidates: inserted,
    summary_path: summaryPath,
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
