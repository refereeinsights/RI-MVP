import { supabaseAdmin } from "../../../lib/supabaseAdmin";

type ValidationStatus =
  | "confirmed"
  | "rule_confirmed"
  | "likely"
  | "conflict"
  | "unknown"
  | "needs_review";

type ValidationMethod = "rule" | "page_scan" | "search" | "manual";

type RuleRow = {
  rule_name: string;
  rule_type: "host_contains" | "url_contains" | "name_contains" | "organizer_contains" | "regex";
  pattern: string;
  detected_sport: string;
  confidence_score: number | null;
  auto_confirm: boolean | null;
  priority: number | null;
};

type TournamentRow = {
  id: string;
  name: string | null;
  sport: string | null;
  official_website_url: string | null;
  source_url: string | null;
  tournament_association?: string | null;
  updated_at?: string | null;
  sport_validation_status?: string | null;
  revalidate?: boolean | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function hostFromUrl(url: string | null | undefined) {
  const raw = (url ?? "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return u.host.toLowerCase();
  } catch {
    return "";
  }
}

function ruleMatches(t: TournamentRow, rule: RuleRow): boolean {
  const pattern = rule.pattern.toLowerCase();
  switch (rule.rule_type) {
    case "host_contains": {
      const host = hostFromUrl(t.official_website_url) || hostFromUrl(t.source_url);
      return host.includes(pattern);
    }
    case "url_contains": {
      const combined = `${t.official_website_url ?? ""} ${t.source_url ?? ""}`.toLowerCase();
      return combined.includes(pattern);
    }
    case "name_contains": {
      return normalize(t.name).includes(pattern);
    }
    case "organizer_contains": {
      return normalize(t.tournament_association).includes(pattern);
    }
    case "regex": {
      try {
        const re = new RegExp(pattern, "i");
        return re.test(t.name ?? "") || re.test(t.official_website_url ?? "") || re.test(t.source_url ?? "");
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

async function fetchActiveRules(): Promise<RuleRow[]> {
  const { data } = await supabaseAdmin
    .from("sport_validation_rules" as any)
    .select(
      "rule_name,rule_type,pattern,detected_sport,confidence_score,auto_confirm,priority"
    )
    .eq("active", true)
    .order("priority", { ascending: false });
  return (data as RuleRow[] | null) ?? [];
}

type MatchResult = {
  rule: RuleRow;
  validatedSport: string;
  status: ValidationStatus;
  method: ValidationMethod;
  confidence: number;
};

function pickBestMatch(t: TournamentRow, rules: RuleRow[]): MatchResult | null {
  const matches: MatchResult[] = [];
  for (const rule of rules) {
    if (!ruleMatches(t, rule)) continue;
    matches.push({
      rule,
      validatedSport: rule.detected_sport,
      status: rule.auto_confirm ? "rule_confirmed" : "likely",
      method: "rule",
      confidence: rule.confidence_score ?? 1.0,
    });
  }
  if (!matches.length) return null;
  matches.sort((a, b) => {
    if (b.confidence !== a.confidence) return (b.confidence ?? 0) - (a.confidence ?? 0);
    const ap = a.rule.priority ?? 0;
    const bp = b.rule.priority ?? 0;
    return bp - ap;
  });
  return matches[0];
}

type UpsertLedgerParams = {
  tournament: TournamentRow;
  result: MatchResult | null;
};

async function upsertLedger({ tournament, result }: UpsertLedgerParams) {
  const now = new Date().toISOString();
  const status: ValidationStatus = result ? result.status : "needs_review";
  const validatedSport = result?.validatedSport ?? null;
  const payload = {
    tournament_id: tournament.id,
    current_sport: tournament.sport,
    validated_sport: validatedSport,
    validation_status: status,
    validation_method: result?.method ?? "rule",
    rule_name: result?.rule.rule_name ?? null,
    confidence_score: result?.confidence ?? null,
    source_url: tournament.official_website_url ?? tournament.source_url ?? null,
    processed_at: now,
    updated_at: now,
    is_active: true,
  };

  await supabaseAdmin.from("tournament_sport_validation" as any).upsert(payload, {
    onConflict: "tournament_id",
  });

  const rollup: Record<string, any> = {
    sport_validation_status: status,
    sport_validation_method: result?.method ?? "rule",
    sport_validation_rule: result?.rule.rule_name ?? null,
    sport_validation_processed_at: now,
    validated_sport: validatedSport,
    revalidate: false,
  };

  // If we have a confirmed match and tournament sport is empty, fill it.
  if (status === "rule_confirmed" && validatedSport && !tournament.sport) {
    rollup.sport = validatedSport;
    rollup.sport_validated_at = now;
  }

  await supabaseAdmin
    .from("tournaments" as any)
    .update(rollup)
    .eq("id", tournament.id);
}

export async function runSportValidationOnce(tournament: TournamentRow, rulesCache?: RuleRow[]) {
  const alreadyConfirmed =
    tournament.sport_validation_status === "confirmed" ||
    tournament.sport_validation_status === "rule_confirmed";
  if (alreadyConfirmed && !tournament.revalidate) {
    return { skipped: true, reason: "already_confirmed" as const, ruleConfirmed: false, conflict: false };
  }

  const rules = rulesCache ?? (await fetchActiveRules());
  const match = pickBestMatch(tournament, rules);

  if (match && tournament.sport && normalize(tournament.sport) !== normalize(match.validatedSport)) {
    // Conflict: do not overwrite automatically
    await supabaseAdmin
      .from("tournament_sport_validation" as any)
      .upsert(
        {
          tournament_id: tournament.id,
          current_sport: tournament.sport,
          validated_sport: match.validatedSport,
          validation_status: "conflict",
          validation_method: "rule",
          rule_name: match.rule.rule_name,
          confidence_score: match.confidence,
          source_url: tournament.official_website_url ?? tournament.source_url ?? null,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_active: true,
        },
        { onConflict: "tournament_id" }
      );
    await supabaseAdmin
      .from("tournaments" as any)
      .update({
        sport_validation_status: "conflict",
        sport_validation_method: "rule",
        sport_validation_rule: match.rule.rule_name,
        sport_validation_processed_at: new Date().toISOString(),
        validated_sport: match.validatedSport,
        revalidate: false,
      })
      .eq("id", tournament.id);
    return { skipped: false, conflict: true, ruleConfirmed: false };
  }

  await upsertLedger({ tournament, result: match });
  return {
    skipped: false,
    conflict: false,
    ruleConfirmed: match?.status === "rule_confirmed",
  };
}

export async function runSportValidationBatch(limit = 200) {
  const { data: rows } = await supabaseAdmin
    .from("tournaments" as any)
    .select(
      "id,name,sport,official_website_url,source_url,tournament_association,updated_at,sport_validation_status,revalidate"
    )
    .or("sport_validation_status.is.null,revalidate.eq.true")
    .order("updated_at", { ascending: false })
    .limit(limit);

  const tournaments = (rows as TournamentRow[] | null) ?? [];
  if (!tournaments.length) {
    return { processed: 0, conflicts: 0, skipped: 0, ruleConfirmed: 0 };
  }

  const rules = await fetchActiveRules();
  let processed = 0;
  let conflicts = 0;
  let skipped = 0;
  let ruleConfirmed = 0;

  for (const t of tournaments) {
    const res = await runSportValidationOnce(t, rules);
    processed += res.skipped ? 0 : 1;
    conflicts += res.conflict ? 1 : 0;
    skipped += res.skipped ? 1 : 0;
    ruleConfirmed += res.ruleConfirmed ? 1 : 0;
  }

  return { processed, conflicts, skipped, ruleConfirmed };
}
