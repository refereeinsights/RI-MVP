const fs = require('fs');
const { load } = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

const LISTING_URL = 'https://www.legion.org/api/eventapi/gettournamentlistingresult';
const BASE = 'https://www.legion.org';

function readEnv(name) {
  const txt = fs.readFileSync('.env.local', 'utf8');
  const m = txt.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^"|"$/g, '') : '';
}

const SUPABASE_URL = readEnv('NEXT_PUBLIC_SUPABASE_URL') || readEnv('SUPABASE_URL');
const SUPABASE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing Supabase env vars in .env.local');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const STATE_TO_ABBR = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC'
};

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function toIsoDate(text) {
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseDateRange(dateText) {
  const raw = (dateText || '').replace(/\u2013|\u2014/g, '-').trim();
  const parts = raw.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  let start = parts[0] ? toIsoDate(parts[0]) : null;
  let end = parts[1] ? toIsoDate(parts[1]) : start;
  const notes = [];

  if (start && end) {
    const startDt = new Date(start + 'T00:00:00Z');
    const endDt = new Date(end + 'T00:00:00Z');
    const diffDays = Math.round((endDt - startDt) / 86400000);

    const startY = startDt.getUTCFullYear();
    const endY = endDt.getUTCFullYear();
    const startM = startDt.getUTCMonth();
    const endM = endDt.getUTCMonth();

    if (endY === startY + 1 && diffDays > 200 && (endM === startM || (endM === startM + 1 && startDt.getUTCDate() <= 7))) {
      const fixed = new Date(Date.UTC(startY, endM, endDt.getUTCDate()));
      end = fixed.toISOString().slice(0, 10);
      notes.push(`normalized_end_year_from_${endY}_to_${startY}`);
    }

    if (new Date(end + 'T00:00:00Z') < startDt) {
      notes.push('end_before_start_kept_as_listed');
    }
  }

  return { start, end, normalizeNotes: notes };
}

function splitLocation(text) {
  const raw = (text || '').trim();
  const m = raw.match(/^(.*?),\s*([A-Za-z ]+)$/);
  if (!m) return { city: null, state: null };
  const city = m[1].trim();
  const stateName = m[2].trim();
  const state = STATE_TO_ABBR[stateName] || (stateName.length === 2 ? stateName.toUpperCase() : null);
  return { city: city || null, state };
}

function pickEmail(lines) {
  for (const line of lines) {
    const m = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (m) return m[0];
  }
  return null;
}

function pickPhone(lines) {
  for (const line of lines) {
    const m = line.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
    if (m) return m[0];
  }
  return null;
}

async function fetchListing() {
  const body = {
    State: '',
    ItemsperPage: 250,
    currentPage: 1,
    Date: '2024-12-10T00:00:00+00:00'
  };
  const res = await fetch(LISTING_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Listing fetch failed: ${res.status}`);
  const html = await res.text();
  const $ = load(html);
  const rows = [];
  $('.resource-listing__item').each((_, el) => {
    const dateText = $(el).find('.resource-listing__dateTime span').first().text().trim();
    const locationText = $(el).find('.resource-listing__location').first().text().trim();
    const name = $(el).find('.resource-listing__heading').first().text().trim();
    const href = $(el).find('a.btn--link').attr('href') || '';
    if (!name || !href) return;
    const detailUrl = new URL(href, BASE).toString();
    rows.push({ name, dateText, locationText, detailUrl });
  });
  return rows;
}

async function fetchDetail(detailUrl) {
  const res = await fetch(detailUrl);
  if (!res.ok) throw new Error(`Detail fetch failed ${res.status}: ${detailUrl}`);
  const html = await res.text();
  const $ = load(html);

  const heading = $('h1.page-banner__heading').first().text().trim() || null;
  const details = {};

  const content = $('.event-details .interior-content').first();
  content.find('h2').each((_, h2) => {
    const key = $(h2).text().trim().toLowerCase().replace(/:$/, '');
    const vals = [];
    let cur = $(h2).next();
    while (cur.length && cur[0].tagName !== 'h2') {
      const t = cur.text().trim();
      if (t) vals.push(t);
      cur = cur.next();
    }
    details[key] = vals;
  });

  const locationVals = details['location'] || [];
  const dateVals = details['date'] || [];
  const contactVals = details['contact information'] || [];

  return {
    heading,
    venueName: locationVals[0] || null,
    locationLine: locationVals[1] || null,
    dateText: dateVals[0] || null,
    contactName: contactVals[0] || null,
    contactEmail: pickEmail(contactVals),
    contactPhone: pickPhone(contactVals),
    rawContact: contactVals.join(' | ') || null
  };
}

async function findOrCreateVenue({ venueName, city, state }) {
  const name = (venueName || 'Tournament Venue').trim();
  const { data: existing, error: e1 } = await supabase
    .from('venues')
    .select('id,name,city,state')
    .eq('name', name)
    .eq('city', city || '')
    .eq('state', state || '')
    .limit(1);
  if (e1) throw e1;
  if (existing && existing[0]?.id) return existing[0].id;

  const { data: created, error: e2 } = await supabase
    .from('venues')
    .insert({
      name,
      address: null,
      city: city || null,
      state: state || null,
      sport: 'baseball',
      notes: 'Imported from legion.org tournaments listing'
    })
    .select('id')
    .single();
  if (e2) throw e2;
  return created.id;
}

async function upsertTournament(row) {
  const { data: existingByUrl, error: e0 } = await supabase
    .from('tournaments')
    .select('id,slug')
    .eq('source_url', row.source_url)
    .limit(1);
  if (e0) throw e0;

  if (existingByUrl && existingByUrl[0]?.id) {
    const id = existingByUrl[0].id;
    const { error: eUp } = await supabase
      .from('tournaments')
      .update(row)
      .eq('id', id);
    if (eUp) throw eUp;
    return { id, action: 'updated' };
  }

  let slug = row.slug;
  const { data: slugHit, error: eSlug } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', slug)
    .limit(1);
  if (eSlug) throw eSlug;
  if (slugHit && slugHit.length) slug = `${slug}-legion`;

  const { data: created, error: eIns } = await supabase
    .from('tournaments')
    .insert({ ...row, slug })
    .select('id')
    .single();
  if (eIns) throw eIns;
  return { id: created.id, action: 'inserted' };
}

async function linkTournamentVenue(tournamentId, venueId) {
  const { data: existing, error: e1 } = await supabase
    .from('tournament_venues')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('venue_id', venueId)
    .limit(1);
  if (e1) throw e1;
  if (existing && existing.length) return false;

  const { error: e2 } = await supabase
    .from('tournament_venues')
    .insert({ tournament_id: tournamentId, venue_id: venueId, is_primary: true });
  if (e2) throw e2;
  return true;
}

(async function main() {
  const listing = await fetchListing();
  let inserted = 0;
  let updated = 0;
  let venuesCreated = 0;
  let linksCreated = 0;
  const normalized = [];

  for (const item of listing) {
    const detail = await fetchDetail(item.detailUrl);
    const dateSource = detail.dateText || item.dateText;
    const locationSource = detail.locationLine || item.locationText;
    const { city, state } = splitLocation(locationSource || '');
    const venueName = detail.venueName || item.name;
    const dr = parseDateRange(dateSource || '');

    if (dr.normalizeNotes.length) {
      normalized.push({ name: item.name, source: dateSource, start: dr.start, end: dr.end, notes: dr.normalizeNotes });
    }

    const baseSlug = slugify([item.name, city, state, dr.start || ''].filter(Boolean).join('-'));
    const tournamentRow = {
      name: detail.heading || item.name,
      slug: baseSlug,
      sport: 'baseball',
      level: null,
      state: state || 'NA',
      city: city || null,
      venue: venueName || null,
      address: null,
      start_date: dr.start,
      end_date: dr.end,
      source_url: item.detailUrl,
      source_domain: 'www.legion.org',
      source_title: detail.heading || item.name,
      source: 'legion',
      status: 'published',
      confidence: 70,
      sub_type: 'internet',
      summary: null,
      tournament_director: detail.contactName,
      tournament_director_email: detail.contactEmail,
      tournament_director_phone: detail.contactPhone,
      referee_contact: detail.rawContact,
      official_website_url: item.detailUrl,
      updated_at: new Date().toISOString(),
      source_last_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    };

    const t = await upsertTournament(tournamentRow);
    if (t.action === 'inserted') inserted += 1;
    else updated += 1;

    const beforeVenue = await supabase
      .from('venues')
      .select('id')
      .eq('name', (venueName || 'Tournament Venue').trim())
      .eq('city', city || '')
      .eq('state', state || '')
      .limit(1);

    const venueId = await findOrCreateVenue({ venueName, city, state });
    if (!beforeVenue.data || !beforeVenue.data.length) venuesCreated += 1;

    const linkNew = await linkTournamentVenue(t.id, venueId);
    if (linkNew) linksCreated += 1;
  }

  console.log(JSON.stringify({
    listingCount: listing.length,
    inserted,
    updated,
    venuesCreated,
    linksCreated,
    normalizedDateCount: normalized.length,
    normalized
  }, null, 2));
})();
