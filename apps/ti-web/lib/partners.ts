import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type Partner = {
  id: string;
  key: string;
  name: string;
  category: string;
  status: string;
  priority: string | null;
  partner_type: string | null;
  website_url: string | null;
  application_url: string | null;
  contact_email: string | null;
  disclosure_text: string | null;
  notes: string | null;
  is_active: boolean;
};

export type PartnerLink = {
  id: string;
  partner_id: string;
  label: string;
  url: string;
  destination_type: string | null;
  page_type: string | null;
  placement: string | null;
  sport: string | null;
  campaign: string | null;
  shared_id: string | null;
  sub_id_1: string | null;
  sub_id_2: string | null;
  sub_id_3: string | null;
  is_active: boolean;
  sort_order: number | null;
};

function asText(value: unknown) {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

function normalizeSportKey(input: string | null | undefined) {
  const s = String(input ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("baseball") || s.includes("softball")) return "baseball_softball";
  if (s.includes("basketball")) return "basketball";
  if (s.includes("soccer")) return "soccer";
  if (s.includes("hockey")) return "hockey";
  if (s.includes("lacrosse")) return "lacrosse";
  return "all_sports";
}

async function fetchActivePartnerByKey(partnerKey: string) {
  const { data } = await (supabaseAdmin.from("partners" as any) as any)
    .select("id,key,name,category,status,priority,partner_type,website_url,application_url,contact_email,disclosure_text,notes,is_active")
    .eq("key", partnerKey)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return (data as Partner | null) ?? null;
}

export async function getPartnerByKey(partnerKey: string) {
  const key = String(partnerKey ?? "").trim();
  if (!key) return { ok: false as const, partner: null as Partner | null, error: "Missing partner key." };
  const partner = await fetchActivePartnerByKey(key);
  return { ok: true as const, partner, error: null as string | null };
}

export async function getPartnerDisclosure(partnerKey: string) {
  const res = await getPartnerByKey(partnerKey);
  return {
    ok: res.ok as true,
    disclosureText: res.partner?.disclosure_text ?? null,
    error: null as string | null,
  };
}

export async function getPartnerLinkForSport(params: {
  partnerKey: string;
  sport?: string | null;
  pageType?: string | null;
  placement?: string | null;
}) {
  const partnerKey = String(params.partnerKey ?? "").trim();
  if (!partnerKey) return { ok: false as const, link: null as PartnerLink | null, partner: null as Partner | null, error: "Missing partner key." };

  const partner = await fetchActivePartnerByKey(partnerKey);
  if (!partner?.id) return { ok: true as const, link: null, partner: null, error: null as string | null };

  const sportKey = normalizeSportKey(params.sport);
  const pageType = asText(params.pageType);
  const placement = asText(params.placement);

  const base = () =>
    (supabaseAdmin.from("partner_links" as any) as any)
      .select(
        "id,partner_id,label,url,destination_type,page_type,placement,sport,campaign,shared_id,sub_id_1,sub_id_2,sub_id_3,is_active,sort_order"
      )
      .eq("partner_id", partner.id)
      .eq("is_active", true);

  const run = async (filters: { pageType?: string | null; placement?: string | null }) => {
    let q = base();
    if (sportKey) q = q.eq("sport", sportKey);
    if (filters.pageType) q = q.eq("page_type", filters.pageType);
    if (filters.placement) q = q.eq("placement", filters.placement);
    const { data } = await q.order("sort_order", { ascending: true }).order("label", { ascending: true }).limit(1).maybeSingle();
    return (data as PartnerLink | null) ?? null;
  };

  // Prefer the most specific match first, then relax.
  let link =
    (await run({ pageType, placement })) ??
    (await run({ pageType: null, placement })) ??
    (await run({ pageType, placement: null })) ??
    (await run({ pageType: null, placement: null }));

  // If sportKey is not all_sports and there was no sport-specific match, fall back to all_sports.
  if (!link && sportKey && sportKey !== "all_sports") {
    const runAll = async (filters: { pageType?: string | null; placement?: string | null }) => {
      let q = base().eq("sport", "all_sports");
      if (filters.pageType) q = q.eq("page_type", filters.pageType);
      if (filters.placement) q = q.eq("placement", filters.placement);

      // LOW guardrail: if placement is omitted and multiple all_sports links exist (e.g. gear_hub vs tournament_page),
      // do not rely on sort_order alone. Prefer the Tournament Pages fallback explicitly.
      q = q.order("sort_order", { ascending: true }).order("label", { ascending: true });
      const { data } = await q.limit(10);
      const rows = ((data as PartnerLink[] | null) ?? []) as PartnerLink[];
      if (!rows.length) return null;

      const explicitTournamentPages =
        rows.find((r) => String(r.label ?? "").toLowerCase() === "tournament pages") ??
        rows.find((r) => String(r.destination_type ?? "").toLowerCase() === "tournament_page") ??
        rows.find((r) => String(r.page_type ?? "").toLowerCase() === "tournament_page") ??
        rows[0];

      return explicitTournamentPages ?? null;
    };

    link =
      (await runAll({ pageType, placement })) ??
      (await runAll({ pageType: null, placement })) ??
      (await runAll({ pageType, placement: null })) ??
      (await runAll({ pageType: null, placement: null }));
  }

  return { ok: true as const, link: link ?? null, partner, error: null as string | null };
}

export async function getFanaticsLinkAndDisclosure(params: { sport?: string | null; pageType?: string | null; placement?: string | null }) {
  const res = await getPartnerLinkForSport({ partnerKey: "fanatics", sport: params.sport, pageType: params.pageType, placement: params.placement });
  return {
    ok: res.ok,
    partner: res.partner,
    link: res.link,
    disclosureText: res.partner?.disclosure_text ?? null,
    error: res.error,
  };
}

