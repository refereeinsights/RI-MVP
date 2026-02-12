import { NextResponse } from "next/server";
import { promises as dns } from "node:dns";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { queueEnrichmentJobs, runQueuedEnrichment } from "@/server/enrichment/pipeline";

async function ensureAdmin() {
  const supa = createSupabaseServerClient();
  const { data: userData, error: userErr } = await supa.auth.getUser();
  if (userErr || !userData.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("user_id, role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;
  return userData.user;
}

export async function POST(req: Request) {
  const admin = await ensureAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const limitInput = Number(body?.limit ?? "25");
  const limit = Number.isFinite(limitInput) ? Math.max(1, Math.min(limitInput, 50)) : 25;

  const { data: dismissedRows } = await supabaseAdmin
    .from("tournament_email_discovery_results" as any)
    .select("tournament_id")
    .not("dismissed_at", "is", null);
  const dismissedIds = new Set((dismissedRows ?? []).map((r: any) => r.tournament_id).filter(Boolean));

  const { data: deadDomainsRows } = await supabaseAdmin
    .from("tournament_dead_domains" as any)
    .select("domain");
  const deadDomains = new Set((deadDomainsRows ?? []).map((r: any) => String(r.domain).toLowerCase()));

  const { data: tournaments } = await supabaseAdmin
    .from("tournaments" as any)
    .select("id,official_website_url,source_url,do_not_contact,tournament_director_email,referee_contact_email")
    .eq("do_not_contact", false)
    .is("tournament_director_email", null)
    .is("referee_contact_email", null)
    .or("official_website_url.not.is.null,source_url.not.is.null")
    .order("updated_at", { ascending: false })
    .limit(limit);

  const withUrls = (tournaments ?? [])
    .map((t: any) => {
      const url = t.official_website_url ?? t.source_url ?? null;
      return { ...t, _candidate_url: url };
    })
    .filter((t: any) => t._candidate_url);

  const domainFor = (raw: string | null) => {
    if (!raw) return null;
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch {
      return null;
    }
  };

  const domainCheckQueue = new Map<string, string[]>();
  for (const t of withUrls) {
    const domain = domainFor(t._candidate_url);
    if (!domain) continue;
    if (deadDomains.has(domain)) continue;
    if (!domainCheckQueue.has(domain)) domainCheckQueue.set(domain, []);
    domainCheckQueue.get(domain)!.push(t.id);
  }

  const deadNow = new Set<string>();
  const domains = Array.from(domainCheckQueue.keys());
  const concurrency = 5;
  for (let i = 0; i < domains.length; i += concurrency) {
    const slice = domains.slice(i, i + concurrency);
    await Promise.all(
      slice.map(async (domain) => {
        try {
          await dns.lookup(domain);
        } catch (err: any) {
          if (err?.code === "ENOTFOUND") {
            deadNow.add(domain);
          }
        }
      })
    );
  }

  if (deadNow.size) {
    const now = new Date().toISOString();
    const deadRows = Array.from(deadNow).map((domain) => ({
      domain,
      last_failed_at: now,
      reason: "dns_enotfound",
    }));
    await supabaseAdmin
      .from("tournament_dead_domains" as any)
      .upsert(deadRows, { onConflict: "domain" });
  }

  const tournamentIds = withUrls
    .filter((t: any) => {
      const domain = domainFor(t._candidate_url);
      if (!t.id) return false;
      if (dismissedIds.has(t.id)) return false;
      if (domain && (deadDomains.has(domain) || deadNow.has(domain))) return false;
      return true;
    })
    .map((t: any) => t.id);
  if (!tournamentIds.length) {
    return NextResponse.json({ ok: false, message: "No tournaments missing emails with URLs." });
  }

  const filteredTournaments = withUrls.filter((t: any) => tournamentIds.includes(t.id));

  const { data: runRow, error: runError } = await supabaseAdmin
    .from("tournament_email_discovery_runs" as any)
    .insert({ created_by: admin.id })
    .select("id")
    .single();
  const runId = (runRow as { id: string } | null)?.id;
  if (runError || !runId) {
    return NextResponse.json({ ok: false, error: "Failed to create discovery run." }, { status: 500 });
  }

  await queueEnrichmentJobs(tournamentIds);
  await runQueuedEnrichment(Math.min(20, tournamentIds.length));

  const { data: candidates } = await supabaseAdmin
    .from("tournament_contact_candidates" as any)
    .select("id,tournament_id,role_normalized,name,email,phone,source_url,confidence")
    .in("tournament_id", tournamentIds)
    .is("accepted_at", null)
    .is("rejected_at", null)
    .not("email", "is", null)
    .limit(1000);

  const existingResp = await supabaseAdmin
    .from("tournament_contacts" as any)
    .select("tournament_id,type,name,email,phone")
    .in("tournament_id", tournamentIds);

  const existingKeys = new Set<string>();
  (existingResp.data ?? []).forEach((row: any) => {
    const key = `${row.tournament_id}|${row.type}|${row.name ?? ""}|${row.email ?? ""}|${row.phone ?? ""}`;
    existingKeys.add(key.toLowerCase());
  });

  const toInsert = (candidates ?? [])
    .map((row: any) => {
      let type: "assignor" | "director" | "general" = "general";
      if (row.role_normalized === "TD") type = "director";
      if (row.role_normalized === "ASSIGNOR") type = "assignor";
      return {
        tournament_id: row.tournament_id,
        type,
        name: row.name ?? null,
        email: row.email ?? null,
        phone: row.phone ?? null,
        source_url: row.source_url ?? null,
        confidence: row.confidence ?? null,
        status: "pending",
        notes: "Auto-discovered email from tournament site.",
      };
    })
    .filter((row: any) => {
      const key = `${row.tournament_id}|${row.type}|${row.name ?? ""}|${row.email ?? ""}|${row.phone ?? ""}`;
      return !existingKeys.has(key.toLowerCase());
    });

  if (toInsert.length) {
    await supabaseAdmin.from("tournament_contacts" as any).insert(toInsert);
    const candidateIds = (candidates ?? []).map((c: any) => c.id).filter(Boolean);
    if (candidateIds.length) {
      await supabaseAdmin
        .from("tournament_contact_candidates" as any)
        .update({ accepted_at: new Date().toISOString() })
        .in("id", candidateIds);
    }
  }

  const emailMap = new Map<string, Set<string>>();
  (candidates ?? []).forEach((row: any) => {
    if (!row.tournament_id || !row.email) return;
    const key = String(row.tournament_id);
    if (!emailMap.has(key)) emailMap.set(key, new Set<string>());
    emailMap.get(key)!.add(String(row.email));
  });

  const rankEmail = (email: string) => {
    const local = email.toLowerCase().split("@")[0] || "";
    if (local.includes("tournament")) return 0;
    if (local.includes("director")) return 1;
    if (local.includes("assignor")) return 2;
    if (local.includes("referee") || local.includes("official")) return 3;
    if (local.includes("info")) return 4;
    if (local.includes("contact")) return 5;
    return 10;
  };

  const resultRows = filteredTournaments.map((t: any) => {
    const emails = Array.from(emailMap.get(String(t.id)) ?? []).sort((a, b) => {
      const rank = rankEmail(a) - rankEmail(b);
      return rank !== 0 ? rank : a.localeCompare(b);
    });
    const sourceUrl = t.official_website_url ?? t.source_url ?? null;
    return {
      run_id: runId,
      tournament_id: t.id,
      source_url: sourceUrl,
      discovered_emails: emails,
    };
  });

  if (resultRows.length) {
    await supabaseAdmin.from("tournament_email_discovery_results" as any).insert(resultRows);
  }

  return NextResponse.json({
    ok: true,
    message: `Queued ${tournamentIds.length} tournaments. Inserted ${toInsert.length} pending contact(s).`,
    inserted: toInsert.length,
    candidates: candidates?.length ?? 0,
    run_id: runId,
  });
}
