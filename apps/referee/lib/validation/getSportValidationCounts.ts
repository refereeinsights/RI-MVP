import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type SportValidationCounts = {
  total: number;
  confirmed: number;
  rule_confirmed: number;
  needs_review: number;
  conflict: number;
  unknown: number;
  likely: number;
  unconfirmed: number;
};

async function countStatus(status: string | null): Promise<number> {
  const query = supabaseAdmin
    .from("tournament_sport_validation" as any)
    .select("id", { count: "exact", head: true });
  const { count } = status
    ? await query.eq("validation_status", status)
    : await query.is("validation_status", null);
  return count ?? 0;
}

export async function getSportValidationCounts(): Promise<SportValidationCounts> {
  const [confirmed, rule_confirmed, needs_review, conflict, unknown, likely, total] = await Promise.all([
    countStatus("confirmed"),
    countStatus("rule_confirmed"),
    countStatus("needs_review"),
    countStatus("conflict"),
    countStatus("unknown"),
    countStatus("likely"),
    (async () => {
      const { count } = await supabaseAdmin
        .from("tournament_sport_validation" as any)
        .select("id", { count: "exact", head: true });
      return count ?? 0;
    })(),
  ]);

  const unconfirmed = total - (confirmed + rule_confirmed);

  return {
    total,
    confirmed,
    rule_confirmed,
    needs_review,
    conflict,
    unknown,
    likely,
    unconfirmed: Math.max(unconfirmed, 0),
  };
}
