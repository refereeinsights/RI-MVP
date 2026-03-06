import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { extractFromPage } from '../apps/referee/src/server/enrichment/extract';

type TournamentRow = {
  id: string;
  name: string;
  slug: string;
  source_url: string | null;
  official_website_url: string | null;
};

type InviteHit = {
  tournament_id: string;
  tournament_name: string;
  tournament_slug: string;
  base_url: string;
  invite_url: string;
  match_type: 'pdf-link' | 'invite-link';
};

const URL_RE = /href\s*=\s*["']([^"']+)["']/gi;
const INVITE_RE = /(tournament|invite|invitation|application|rules|team\s*application|referee\s*form|referee\s*plan|guest\s*player|entry\s*form|field\s*directions|venue)/i;
const NOISE_RE = /(zoom\.us|wiki\.ayso\.org|incident_report|parent\s*code|coach\s*code|concussion|refund|sponsor|policy|protocol|abuse|pledge|covid|budget|calendar|age-determination)/i;

function toAbs(href: string, base: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

async function fetchPage(url: string): Promise<{ ok: boolean; finalUrl: string; status: number; contentType: string; html: string | null }> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'RI AYSO invitation scanner/ingest' },
    });
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok) return { ok: false, finalUrl: res.url, status: res.status, contentType, html: null };
    if (!contentType.includes('text/html')) {
      return { ok: true, finalUrl: res.url, status: res.status, contentType, html: null };
    }
    const html = await res.text();
    return { ok: true, finalUrl: res.url, status: res.status, contentType, html };
  } catch {
    return { ok: false, finalUrl: url, status: 0, contentType: '', html: null };
  }
}

function extractInviteLinks(html: string, baseUrl: string): InviteHit['invite_url'][] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(html))) {
    const href = (m[1] || '').trim();
    if (!href || href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('mailto:')) continue;
    const abs = toAbs(href, baseUrl);
    if (!abs) continue;
    const d = decodeURIComponent(abs).toLowerCase();
    if (NOISE_RE.test(d)) continue;
    if (!INVITE_RE.test(d) && !d.includes('.pdf')) continue;
    out.push(abs);
  }
  return [...new Set(out)];
}

function csvEscape(v: string | number | null | undefined) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const { data: tournaments, error } = await supabase
    .from('tournaments')
    .select('id,name,slug,source_url,official_website_url,tournament_association,sport,status')
    .eq('sport', 'soccer')
    .eq('tournament_association', 'AYSO')
    .in('status', ['draft', 'published'])
    .order('name', { ascending: true })
    .limit(1000);

  if (error) throw new Error(`Tournament query failed: ${error.message}`);

  const sourceRows = ((tournaments ?? []) as TournamentRow[])
    .map((t) => ({ ...t, base_url: t.official_website_url || t.source_url }))
    .filter((t) => Boolean(t.base_url));

  const hits: InviteHit[] = [];

  for (const t of sourceRows) {
    const baseUrl = t.base_url as string;
    const page = await fetchPage(baseUrl);
    if (!page.ok || !page.html) continue;

    const links = extractInviteLinks(page.html, page.finalUrl || baseUrl).slice(0, 8);
    for (const inviteUrl of links) {
      const lower = inviteUrl.toLowerCase();
      hits.push({
        tournament_id: t.id,
        tournament_name: t.name,
        tournament_slug: t.slug,
        base_url: baseUrl,
        invite_url: inviteUrl,
        match_type: lower.includes('.pdf') ? 'pdf-link' : 'invite-link',
      });
    }
  }

  const deduped = Array.from(
    new Map(hits.map((h) => [`${h.tournament_id}|${h.invite_url}`, h])).values()
  );

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outDir = path.join(process.cwd(), 'tmp', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, `ayso_invitation_links_${stamp}.csv`);

  const header = [
    'tournament_id',
    'tournament_name',
    'tournament_slug',
    'base_url',
    'invite_url',
    'match_type',
  ];
  const lines = [
    header.join(','),
    ...deduped.map((r) =>
      [
        r.tournament_id,
        r.tournament_name,
        r.tournament_slug,
        r.base_url,
        r.invite_url,
        r.match_type,
      ]
        .map(csvEscape)
        .join(',')
    ),
  ];
  fs.writeFileSync(csvPath, lines.join('\n'));

  // Ingest HTML invite pages into existing enrichment approval queues.
  const htmlHits = deduped.filter((h) => h.match_type !== 'pdf-link');

  let insertedContacts = 0;
  let insertedVenues = 0;
  let insertedDates = 0;

  for (const hit of htmlHits) {
    const page = await fetchPage(hit.invite_url);
    if (!page.ok || !page.html) continue;

    const result = extractFromPage(page.html, page.finalUrl || hit.invite_url);

    const contacts = (result.contacts || []).slice(0, 12).map((c) => ({
      tournament_id: hit.tournament_id,
      role_raw: c.role_raw ?? null,
      role_normalized: c.role_normalized ?? null,
      name: c.name ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      source_url: c.source_url ?? page.finalUrl ?? hit.invite_url,
      evidence_text: c.evidence_text ?? null,
      confidence: c.confidence ?? null,
    }));

    if (contacts.length) {
      const { data: existing } = await supabase
        .from('tournament_contact_candidates')
        .select('role_normalized,name,email,phone')
        .eq('tournament_id', hit.tournament_id)
        .is('accepted_at', null)
        .is('rejected_at', null);

      const sig = new Set((existing ?? []).map((e: any) => `${(e.role_normalized ?? '').toUpperCase()}|${(e.name ?? '').toLowerCase()}|${(e.email ?? '').toLowerCase()}|${String(e.phone ?? '').replace(/\D+/g, '')}`));
      const toInsert = contacts.filter((c) => {
        const s = `${(c.role_normalized ?? '').toUpperCase()}|${(c.name ?? '').toLowerCase()}|${(c.email ?? '').toLowerCase()}|${String(c.phone ?? '').replace(/\D+/g, '')}`;
        if (sig.has(s)) return false;
        sig.add(s);
        return true;
      });
      if (toInsert.length) {
        const { error: insertErr } = await supabase.from('tournament_contact_candidates').insert(toInsert as any);
        if (!insertErr) insertedContacts += toInsert.length;
      }
    }

    const venues = (result.venues || []).slice(0, 12).map((v) => ({
      tournament_id: hit.tournament_id,
      venue_name: v.venue_name ?? null,
      address_text: v.address_text ?? null,
      venue_url: v.venue_url ?? null,
      source_url: v.source_url ?? page.finalUrl ?? hit.invite_url,
      evidence_text: v.evidence_text ?? null,
      confidence: v.confidence ?? null,
    })).filter((v) => v.venue_name || v.address_text || v.venue_url);

    if (venues.length) {
      const { data: existing } = await supabase
        .from('tournament_venue_candidates')
        .select('venue_name,address_text,venue_url')
        .eq('tournament_id', hit.tournament_id)
        .is('accepted_at', null)
        .is('rejected_at', null);

      const sig = new Set((existing ?? []).map((e: any) => `${(e.venue_name ?? '').toLowerCase()}|${(e.address_text ?? '').toLowerCase()}|${(e.venue_url ?? '').toLowerCase()}`));
      const toInsert = venues.filter((v) => {
        const s = `${(v.venue_name ?? '').toLowerCase()}|${(v.address_text ?? '').toLowerCase()}|${(v.venue_url ?? '').toLowerCase()}`;
        if (sig.has(s)) return false;
        sig.add(s);
        return true;
      });

      if (toInsert.length) {
        const { error: insertErr } = await supabase.from('tournament_venue_candidates').insert(toInsert as any);
        if (!insertErr) insertedVenues += toInsert.length;
      }
    }

    const dates = (result.dates || []).slice(0, 8).map((d) => ({
      tournament_id: hit.tournament_id,
      date_text: d.date_text ?? null,
      start_date: d.start_date ?? null,
      end_date: d.end_date ?? null,
      source_url: d.source_url ?? page.finalUrl ?? hit.invite_url,
      evidence_text: d.evidence_text ?? null,
      confidence: d.confidence ?? null,
    })).filter((d) => d.date_text || d.start_date || d.end_date);

    if (dates.length) {
      const { data: existing } = await supabase
        .from('tournament_date_candidates')
        .select('date_text,start_date,end_date')
        .eq('tournament_id', hit.tournament_id)
        .is('accepted_at', null)
        .is('rejected_at', null);

      const sig = new Set((existing ?? []).map((e: any) => `${(e.date_text ?? '').toLowerCase()}|${e.start_date ?? ''}|${e.end_date ?? ''}`));
      const toInsert = dates.filter((d) => {
        const s = `${(d.date_text ?? '').toLowerCase()}|${d.start_date ?? ''}|${d.end_date ?? ''}`;
        if (sig.has(s)) return false;
        sig.add(s);
        return true;
      });

      if (toInsert.length) {
        const { error: insertErr } = await supabase.from('tournament_date_candidates').insert(toInsert as any);
        if (!insertErr) insertedDates += toInsert.length;
      }
    }
  }

  const byTournament = new Map<string, { name: string; slug: string; htmlLinks: number; pdfLinks: number }>();
  for (const row of deduped) {
    const current = byTournament.get(row.tournament_id) ?? {
      name: row.tournament_name,
      slug: row.tournament_slug,
      htmlLinks: 0,
      pdfLinks: 0,
    };
    if (row.match_type === 'pdf-link') current.pdfLinks += 1;
    else current.htmlLinks += 1;
    byTournament.set(row.tournament_id, current);
  }

  const summaryPath = path.join(outDir, `ayso_invitation_ingest_summary_${stamp}.json`);
  const summary = {
    generated_at: new Date().toISOString(),
    csv_path: csvPath,
    summary_path: summaryPath,
    total_tournaments_scanned: sourceRows.length,
    invite_hits_total: deduped.length,
    html_hits: htmlHits.length,
    pdf_hits: deduped.filter((h) => h.match_type === 'pdf-link').length,
    tournaments_with_hits: byTournament.size,
    inserted: {
      tournament_contact_candidates: insertedContacts,
      tournament_venue_candidates: insertedVenues,
      tournament_date_candidates: insertedDates,
    },
    sample_tournaments: Array.from(byTournament.values()).slice(0, 25),
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
