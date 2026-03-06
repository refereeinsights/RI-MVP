const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const INVITE_RE = /(tournament|invite|invitation|application|rules|team\s*application|referee\s*form|referee\s*plan|guest\s*player|entry\s*form)/i;
const NOISE_RE = /(zoom\.us|wiki\.ayso\.org|incident_report|parent\s*code|coach\s*code|concussion|refund|sponsor|policy|protocol|abuse|pledge|covid|budget|calendar|age-determination)/i;

(async () => {
  const { data, error } = await supabase
    .from('tournaments')
    .select('name,slug,source_url,official_website_url,tournament_association,sport')
    .eq('sport', 'soccer')
    .eq('tournament_association', 'AYSO')
    .order('name', { ascending: true })
    .limit(1000);
  if (error) throw error;

  const rows = (data ?? []).map((r) => ({ name: r.name, slug: r.slug, url: r.official_website_url || r.source_url })).filter((r) => !!r.url);
  const URL_RE = /href\s*=\s*["']([^"']+)["']/gi;

  function abs(href, base) { try { return new URL(href, base).toString(); } catch { return null; } }

  async function linksForPage(url) {
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 Codex strict invite scanner' } });
    if (!res.ok) return [];
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('pdf') || url.toLowerCase().includes('.pdf')) return [res.url];
    const html = await res.text();
    const out = [];
    let m;
    while ((m = URL_RE.exec(html))) {
      const a = abs((m[1] || '').trim(), res.url || url);
      if (!a) continue;
      out.push(a);
    }
    return out;
  }

  const report = [];
  for (const r of rows) {
    let links = [];
    try { links = await linksForPage(r.url); } catch { links = []; }
    const filtered = [];
    const seen = new Set();
    for (const link of links) {
      const l = decodeURIComponent(link).toLowerCase();
      if (NOISE_RE.test(l)) continue;
      if (!INVITE_RE.test(l)) continue;
      if (seen.has(link)) continue;
      seen.add(link);
      filtered.push(link);
      if (filtered.length >= 6) break;
    }
    if (filtered.length) report.push({ name: r.name, slug: r.slug, url: r.url, invite_links: filtered });
  }

  console.log(JSON.stringify({ ayso_total_urls: rows.length, strict_invite_hits: report.length, examples: report.slice(0, 25) }, null, 2));
})();
