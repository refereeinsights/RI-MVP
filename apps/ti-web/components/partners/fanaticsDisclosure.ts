export const FANATICS_AFFILIATE_DISCLOSURE_FALLBACK =
  "TournamentInsights may earn a commission from qualifying purchases through this link, at no additional cost to you.";

export function resolveFanaticsAffiliateDisclosureText(disclosureText: string | null | undefined) {
  const t = String(disclosureText ?? "").trim();
  return t ? t : FANATICS_AFFILIATE_DISCLOSURE_FALLBACK;
}

