const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

(async () => {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id,name,slug,source_url,official_website_url,tournament_association,sport')
    .eq('sport', 'soccer')
    .eq('tournament_association', 'AYSO')
    .order('name', { ascending: true })
    .limit(1000);

  if (error) {
    console.error('DB error:', error.message);
    process.exit(1);
  }

  const rows = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    url: r.official_website_url || r.source_url,
  })).filter((r) => !!r.url);

  const ABS = (href, base) => {
    try { return new URL(href, base).toString(); } catch { return null; }
  };

  const URL_RE = /href\s*=\s*["']([^"']+)["']/gi;

  function extractCandidateLinks(html, baseUrl) {
    const out = [];
    let m;
    while ((m = URL_RE.exec(html))) {
      const href = (m[1] || '').trim();
      if (!href || href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('mailto:')) continue;
      const absolute = ABS(href, baseUrl);
      if (!absolute) continue;
      const l = absolute.toLowerCase();
      const looksInvite = /invite|invitation|tournament-info|tournament-information|info-packet|rules|application|regist|brochure|fact-sheet/.test(l);
      const pdf = l.includes('.pdf');
      if (looksInvite || pdf) out.push({ url: absolute, pdf, looksInvite });
    }
    return out;
  }

  async function fetchText(target) {
    const res = await fetch(target, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 Codex AYSO URL scanner' } });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const isPdf = ct.includes('pdf') || target.toLowerCase().includes('.pdf');
    if (!res.ok) return { ok: false, status: res.status, ct, finalUrl: res.url, text: '', isPdf };
    const text = isPdf ? '' : await res.text();
    return { ok: true, status: res.status, ct, finalUrl: res.url, text, isPdf };
  }

  const findings = [];

  for (const row of rows) {
    let primary;
    try {
      primary = await fetchText(row.url);
    } catch (e) {
      findings.push({ id: row.id, name: row.name, slug: row.slug, url: row.url, status: 0, error: String(e), matches: [] });
      continue;
    }
    const record = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      url: row.url,
      status: primary.status,
      pdfPrimary: primary.isPdf,
      matches: [],
    };

    if (primary.ok && primary.isPdf) {
      record.matches.push({ url: primary.finalUrl, type: 'pdf-primary' });
    }

    if (primary.ok && primary.text) {
      const candidates = extractCandidateLinks(primary.text, primary.finalUrl || row.url);
      const dedupe = new Set();
      for (const c of candidates) {
        if (dedupe.has(c.url)) continue;
        dedupe.add(c.url);
        record.matches.push({ url: c.url, type: c.pdf ? 'pdf-link' : 'invite-link' });
        if (record.matches.length >= 8) break;
      }
    }

    findings.push(record);
  }

  const withMatches = findings.filter((f) => f.matches.length > 0);
  const withoutMatches = findings.filter((f) => f.matches.length === 0);

  console.log(JSON.stringify({
    total_ayso_with_url: rows.length,
    tournaments_with_invite_or_pdf: withMatches.length,
    tournaments_without_match: withoutMatches.length,
    sample_with_matches: withMatches.slice(0, 30),
    sample_without_matches: withoutMatches.slice(0, 30).map((x) => ({ name: x.name, slug: x.slug, url: x.url, status: x.status })),
  }, null, 2));
})();
