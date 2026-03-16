import { createClient } from "@supabase/supabase-js";

type TournamentRow = {
  id: string;
  name: string | null;
  source_url: string | null;
  official_website_url: string | null;
  status?: string | null;
  is_canonical?: boolean | null;
};

const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split("=")[1])) : 1500;
const OFFSET_ARG = process.argv.find((arg) => arg.startsWith("--offset="));
const OFFSET = OFFSET_ARG ? Math.max(0, Number(OFFSET_ARG.split("=")[1])) : 0;
const ONLY_CANONICAL = process.argv.includes("--only-canonical");
const DEBUG = process.argv.includes("--debug");

const CHUNK_SIZE = 200;

function clean(value: string | null | undefined) {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v.length ? v : null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripYearSlug(slug: string) {
  return slug
    .split("-")
    .filter((part) => !/^\d{4}$/.test(part))
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toCompact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function safeUrl(input: string) {
  const raw = clean(input);
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    // If the URL is missing a scheme, try https.
    try {
      return new URL(`https://${raw}`);
    } catch {
      return null;
    }
  }
}

function buildMatch(nameRaw: string, sourceUrlRaw: string) {
  const name = clean(nameRaw) ?? "";
  const parsed = safeUrl(sourceUrlRaw);
  if (!parsed) return { ok: false as const, reason: "invalid_url" as const };

  const urlNorm = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  const urlCompact = toCompact(urlNorm);

  const nameSlug = slugify(name);
  const nameSlugNoYear = stripYearSlug(nameSlug);
  const slugCompact = toCompact(nameSlugNoYear);

  // High confidence: URL contains a compacted slug of the tournament name (minus year).
  if (slugCompact.length >= 8 && urlCompact.includes(slugCompact)) {
    return { ok: true as const, score: 1, reason: "slug_contains" as const, url: parsed.toString() };
  }

  // Fallback: token match against URL.
  const tokens = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .filter((t) => t.length >= 3)
    .filter((t) => !["the", "and", "for", "with", "in", "at", "on", "of", "to", "a", "an"].includes(t));

  if (tokens.length === 0) return { ok: false as const, reason: "no_tokens" as const };

  const uniqueTokens = Array.from(new Set(tokens));
  const matched = uniqueTokens.filter((t) => urlCompact.includes(toCompact(t)));
  const ratio = matched.length / uniqueTokens.length;
  const hasStrongToken = matched.some((t) => t.length >= 5);

  // Require at least two meaningful tokens (or three short tokens) and decent coverage.
  if ((matched.length >= 2 && ratio >= 0.6 && hasStrongToken) || matched.length >= 3) {
    const score = Math.min(0.95, 0.5 + ratio * 0.5);
    return { ok: true as const, score, reason: "token_match" as const, url: parsed.toString(), matched };
  }

  return { ok: false as const, reason: "no_match" as const };
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let totalFetched = 0;
  let totalEligible = 0;
  let totalMatched = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  const examples: Array<{ id: string; name: string; source_url: string; score: number; reason: string }> = [];

  let offset = OFFSET;
  while (totalEligible < LIMIT) {
    let query = supabase
      .from("tournaments" as any)
      .select("id,name,source_url,official_website_url,status,is_canonical")
      .order("created_at", { ascending: false })
      .range(offset, offset + CHUNK_SIZE - 1)
      .is("official_website_url", null)
      .not("source_url", "is", null);

    if (ONLY_CANONICAL) query = query.eq("is_canonical", true);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as TournamentRow[];
    totalFetched += rows.length;
    if (!rows.length) break;

    for (const row of rows) {
      if (totalEligible >= LIMIT) break;
      const name = clean(row.name);
      const sourceUrl = clean(row.source_url);
      const officialUrl = clean(row.official_website_url);
      if (!name || !sourceUrl || officialUrl) {
        totalSkipped++;
        continue;
      }

      totalEligible++;
      const match = buildMatch(name, sourceUrl);
      if (!match.ok) {
        if (DEBUG) {
          console.log(JSON.stringify({ id: row.id, name, source_url: sourceUrl, result: match.reason }));
        }
        totalSkipped++;
        continue;
      }

      totalMatched++;
      examples.push({ id: row.id, name, source_url: sourceUrl, score: match.score, reason: match.reason });

      if (APPLY) {
        const { error: updateError } = await supabase
          .from("tournaments" as any)
          .update({ official_website_url: match.url })
          .eq("id", row.id);
        if (updateError) {
          totalErrors++;
          if (DEBUG) console.error("update_error", row.id, updateError.message);
          continue;
        }
        totalUpdated++;
      }

      if (DEBUG) {
        console.log(JSON.stringify({ id: row.id, name, source_url: sourceUrl, official_website_url: match.url, score: match.score }));
      }
    }

    if (rows.length < CHUNK_SIZE) break;
    offset += CHUNK_SIZE;
  }

  examples.sort((a, b) => b.score - a.score);

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        onlyCanonical: ONLY_CANONICAL,
        limit: LIMIT,
        offset: OFFSET,
        fetched: totalFetched,
        eligibleMissingOfficial: totalEligible,
        matched: totalMatched,
        updated: totalUpdated,
        skipped: totalSkipped,
        errors: totalErrors,
        topExamples: examples.slice(0, 20),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

