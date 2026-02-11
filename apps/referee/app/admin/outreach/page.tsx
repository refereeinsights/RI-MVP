import Link from "next/link";
import { redirect } from "next/navigation";
import AdminNav from "@/components/admin/AdminNav";
import OutreachCopyButtons from "@/components/admin/OutreachCopyButtons";
import OutreachTemplateEditor from "@/components/admin/OutreachTemplateEditor";
import EmailDiscoveryPanel from "@/components/admin/EmailDiscoveryPanel";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DEFAULT_TEMPLATES, buildTournamentUrl, renderOutreachTemplate } from "@/lib/outreach";

export const runtime = "nodejs";

type TabKey = "draft" | "sent" | "followup-due" | "followup-sent" | "replied" | "verified" | "suppressed";

const TAB_LABELS: Record<TabKey, string> = {
  draft: "Draft",
  sent: "Sent",
  "followup-due": "Follow-up due",
  "followup-sent": "Follow-up sent",
  replied: "Replied",
  verified: "Verified",
  suppressed: "Suppressed",
};

const DNC_REASONS = [
  { value: "opted_out", label: "Opted out" },
  { value: "wrong_person", label: "Wrong person" },
  { value: "complaint", label: "Complaint" },
  { value: "other", label: "Other" },
];

function buildMailto(to: string, subject: string, body: string) {
  const encode = (value: string) => encodeURIComponent(value);
  return `mailto:${encodeURIComponent(to)}?subject=${encode(subject)}&body=${encode(body)}`;
}

export default async function OutreachPage({
  searchParams,
}: {
  searchParams?: { tab?: TabKey; notice?: string; state?: string; sport?: string; start_from?: string; start_to?: string; q?: string };
}) {
  await requireAdmin();
  const notice = searchParams?.notice ?? "";
  const tab: TabKey = (searchParams?.tab as TabKey) ?? "draft";
  const state = (searchParams?.state ?? "").trim();
  const sport = (searchParams?.sport ?? "").trim();
  const startFrom = (searchParams?.start_from ?? "").trim();
  const startTo = (searchParams?.start_to ?? "").trim();
  const queryText = (searchParams?.q ?? "").trim();

  const nowIso = new Date().toISOString();

  const { data: templateRows } = await supabaseAdmin
    .from("outreach_email_templates" as any)
    .select("key,name,subject_template,body_template,is_active,updated_at,updated_by")
    .eq("is_active", true)
    .in("key", ["tournament_initial", "tournament_followup"]);

  const templateMap = new Map<string, any>();
  (templateRows ?? []).forEach((row: any) => {
    if (row?.key) templateMap.set(row.key, row);
  });
  const initialTemplate = templateMap.get("tournament_initial") ?? DEFAULT_TEMPLATES.tournament_initial;
  const followupTemplate = templateMap.get("tournament_followup") ?? DEFAULT_TEMPLATES.tournament_followup;

  const { data: sportEmailRows } = await supabaseAdmin
    .from("tournaments" as any)
    .select("sport,tournament_director_email");
  const sportTotals = new Map<string, { total: number; withEmail: number }>();
  (sportEmailRows ?? []).forEach((row: any) => {
    const sportKey = row.sport ? String(row.sport).toLowerCase() : "unknown";
    const entry = sportTotals.get(sportKey) ?? { total: 0, withEmail: 0 };
    entry.total += 1;
    const hasEmail = row.tournament_director_email && String(row.tournament_director_email).trim() !== "";
    if (hasEmail) entry.withEmail += 1;
    sportTotals.set(sportKey, entry);
  });
  const sportSummary = Array.from(sportTotals.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  let query = supabaseAdmin
    .from("tournament_outreach" as any)
    .select(
      "id,tournament_id,contact_name,contact_email,status,email_subject_snapshot,email_body_snapshot,followup_subject_snapshot,followup_body_snapshot,sent_at,followup_due_at,followup_sent_at,replied_at,notes,created_at,updated_at,tournaments(id,name,slug,city,state,sport,do_not_contact,do_not_contact_reason,do_not_contact_at,tournament_director,tournament_director_email)"
    );

  if (tab === "followup-due") {
    query = query.eq("status", "sent").lte("followup_due_at", nowIso);
  } else if (tab === "suppressed") {
    query = query.in("status", ["suppressed", "closed"]);
  } else {
    const status = tab === "followup-sent" ? "followup_sent" : tab;
    query = query.eq("status", status);
  }

  if (state) query = query.eq("tournaments.state", state);
  if (sport) query = query.eq("tournaments.sport", sport);
  if (startFrom) query = query.gte("tournaments.start_date", startFrom);
  if (startTo) query = query.lte("tournaments.start_date", startTo);
  if (queryText) query = query.ilike("tournaments.name", `%${queryText}%`);

  const { data: outreachRowsRaw } = await query.order("updated_at", { ascending: false });
  let outreachRows = (outreachRowsRaw ?? []) as any[];

  if (tab === "suppressed") {
    outreachRows = outreachRows.filter((row) => row.tournaments?.do_not_contact || ["suppressed", "closed"].includes(row.status));
  }

  async function saveTemplateAction(formData: FormData) {
    "use server";
    const admin = await requireAdmin();
    const key = String(formData.get("template_key") || "");
    const name = String(formData.get("template_name") || "").trim();
    const subject = String(formData.get("subject_template") || "");
    const body = String(formData.get("body_template") || "");

    if (!key || !subject || !body) {
      redirect("/admin/outreach?notice=Missing%20template%20data");
    }

    await supabaseAdmin
      .from("outreach_email_templates" as any)
      .upsert({
        key,
        name: name || key,
        subject_template: subject,
        body_template: body,
        is_active: true,
        updated_by: admin.id,
      }, { onConflict: "key" });

    redirect(`/admin/outreach?notice=${encodeURIComponent("Template saved")}`);
  }

  async function updateOutreachNotes(formData: FormData) {
    "use server";
    await requireAdmin();
    const outreachId = String(formData.get("outreach_id") || "");
    const notes = String(formData.get("notes") || "").trim();
    if (!outreachId) redirect("/admin/outreach?notice=Missing%20outreach%20id");
    await supabaseAdmin.from("tournament_outreach" as any).update({ notes }).eq("id", outreachId);
    redirect(`/admin/outreach?tab=${tab}&notice=${encodeURIComponent("Notes updated")}`);
  }

  async function markSent(formData: FormData) {
    "use server";
    await requireAdmin();
    const outreachId = String(formData.get("outreach_id") || "");
    if (!outreachId) redirect("/admin/outreach?notice=Missing%20outreach%20id");
    const subject = String(formData.get("subject") || "");
    const body = String(formData.get("body") || "");
    await supabaseAdmin
      .from("tournament_outreach" as any)
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        followup_due_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        email_subject_snapshot: subject,
        email_body_snapshot: body,
      })
      .eq("id", outreachId);
    redirect(`/admin/outreach?tab=sent&notice=${encodeURIComponent("Marked sent")}`);
  }

  async function markFollowupSent(formData: FormData) {
    "use server";
    await requireAdmin();
    const outreachId = String(formData.get("outreach_id") || "");
    if (!outreachId) redirect("/admin/outreach?notice=Missing%20outreach%20id");
    const subject = String(formData.get("subject") || "");
    const body = String(formData.get("body") || "");
    await supabaseAdmin
      .from("tournament_outreach" as any)
      .update({
        status: "followup_sent",
        followup_sent_at: new Date().toISOString(),
        followup_subject_snapshot: subject,
        followup_body_snapshot: body,
      })
      .eq("id", outreachId);
    redirect(`/admin/outreach?tab=followup-sent&notice=${encodeURIComponent("Marked follow-up sent")}`);
  }

  async function markReplied(formData: FormData) {
    "use server";
    await requireAdmin();
    const outreachId = String(formData.get("outreach_id") || "");
    if (!outreachId) redirect("/admin/outreach?notice=Missing%20outreach%20id");
    await supabaseAdmin
      .from("tournament_outreach" as any)
      .update({ status: "replied", replied_at: new Date().toISOString() })
      .eq("id", outreachId);
    redirect(`/admin/outreach?tab=replied&notice=${encodeURIComponent("Marked replied")}`);
  }

  async function markVerified(formData: FormData) {
    "use server";
    await requireAdmin();
    const outreachId = String(formData.get("outreach_id") || "");
    if (!outreachId) redirect("/admin/outreach?notice=Missing%20outreach%20id");
    await supabaseAdmin
      .from("tournament_outreach" as any)
      .update({ status: "verified" })
      .eq("id", outreachId);
    redirect(`/admin/outreach?tab=verified&notice=${encodeURIComponent("Marked verified")}`);
  }

  async function markDnc(formData: FormData) {
    "use server";
    await requireAdmin();
    const tournamentId = String(formData.get("tournament_id") || "");
    const reason = String(formData.get("reason") || "other");
    if (!tournamentId) redirect("/admin/outreach?notice=Missing%20tournament%20id");

    await supabaseAdmin
      .from("tournaments" as any)
      .update({
        do_not_contact: true,
        do_not_contact_at: new Date().toISOString(),
        do_not_contact_reason: reason,
      })
      .eq("id", tournamentId);

    await supabaseAdmin
      .from("tournament_outreach" as any)
      .update({ status: "suppressed" })
      .eq("tournament_id", tournamentId);

    redirect(`/admin/outreach?tab=suppressed&notice=${encodeURIComponent("Marked do-not-contact")}`);
  }

  async function clearDnc(formData: FormData) {
    "use server";
    await requireAdmin();
    const tournamentId = String(formData.get("tournament_id") || "");
    if (!tournamentId) redirect("/admin/outreach?notice=Missing%20tournament%20id");

    await supabaseAdmin
      .from("tournaments" as any)
      .update({
        do_not_contact: false,
        do_not_contact_at: null,
        do_not_contact_reason: null,
      })
      .eq("id", tournamentId);

    redirect(`/admin/outreach?tab=${tab}&notice=${encodeURIComponent("Cleared do-not-contact")}`);
  }

  async function updateTournamentEmailAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const tournamentId = String(formData.get("tournament_id") || "");
    const email = String(formData.get("tournament_director_email") || "").trim();
    if (!tournamentId || !email) {
      redirect(`/admin/outreach?tab=${tab}&notice=${encodeURIComponent("Missing tournament or email")}`);
    }
    await supabaseAdmin
      .from("tournaments" as any)
      .update({ tournament_director_email: email })
      .eq("id", tournamentId);
    redirect(`/admin/outreach?tab=${tab}&notice=${encodeURIComponent("Email updated")}`);
  }

  return (
    <main className="pitchWrap">
      <section className="field">
        <AdminNav />
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Tournament outreach</h1>
          <p style={{ color: "#555", marginTop: 0 }}>
            Draft and track outreach to tournament staff. Email sending is manual.
          </p>
          <div style={{ marginTop: 12, padding: 14, borderRadius: 12, border: "1px solid #d1d5db", background: "#fff" }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Director email coverage by sport</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              {sportSummary.length ? (
                sportSummary.map(([sportKey, stats]) => (
                  <div
                    key={sportKey}
                    style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#f9fafb" }}
                  >
                    <div style={{ fontWeight: 800, textTransform: "capitalize" }}>{sportKey}</div>
                    <div style={{ fontSize: 13, color: "#374151" }}>
                      {stats.withEmail} with director email
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>of {stats.total} tournaments</div>
                  </div>
                ))
              ) : (
                <div style={{ color: "#6b7280" }}>No tournaments found.</div>
              )}
            </div>
          </div>
          <div style={{ marginTop: 14, padding: 14, borderRadius: 12, border: "1px solid #d1d5db", background: "#fff" }}>
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 800 }}>Email templates</summary>
              <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                <OutreachTemplateEditor
                  initialTemplate={initialTemplate}
                  followupTemplate={followupTemplate}
                  defaultInitial={DEFAULT_TEMPLATES.tournament_initial}
                  defaultFollowup={DEFAULT_TEMPLATES.tournament_followup}
                  onSave={saveTemplateAction}
                />
              </div>
            </details>
          </div>
          <form
            method="GET"
            action="/admin/outreach"
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
              gap: 10,
              alignItems: "end",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <input type="hidden" name="tab" value={tab} />
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Tournament name
              <input
                type="text"
                name="q"
                placeholder="Search by name"
                defaultValue={queryText}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              State
              <input
                type="text"
                name="state"
                placeholder="e.g. WA"
                defaultValue={state}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Sport
              <select
                name="sport"
                defaultValue={sport}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              >
                <option value="">All sports</option>
                <option value="soccer">Soccer</option>
                <option value="basketball">Basketball</option>
                <option value="football">Football</option>
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Start date from
              <input
                type="date"
                name="start_from"
                defaultValue={startFrom}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Start date to
              <input
                type="date"
                name="start_to"
                defaultValue={startTo}
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="submit"
                style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#111", color: "#fff", fontWeight: 800 }}
              >
                Apply filters
              </button>
              <a
                href={`/admin/outreach?tab=${tab}`}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #111", color: "#111", fontWeight: 800, textDecoration: "none" }}
              >
                Reset
              </a>
            </div>
          </form>
          <EmailDiscoveryPanel />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
              (() => {
                const params = new URLSearchParams();
                params.set("tab", key);
                if (queryText) params.set("q", queryText);
                if (state) params.set("state", state);
                if (sport) params.set("sport", sport);
                if (startFrom) params.set("start_from", startFrom);
                if (startTo) params.set("start_to", startTo);
                const href = `/admin/outreach?${params.toString()}`;
                return (
              <Link
                key={key}
                href={href}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: tab === key ? "1px solid #0f172a" : "1px solid #d1d5db",
                  background: tab === key ? "#0f172a" : "#fff",
                  color: tab === key ? "#fff" : "#111",
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {TAB_LABELS[key]}
              </Link>
                );
              })()
            ))}
            <Link
              href="/admin/outreach/create"
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #0f172a",
                background: "#fff",
                color: "#0f172a",
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 800,
                marginLeft: "auto",
              }}
            >
              Create outreach rows
            </Link>
          </div>
          {notice ? (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid #cbd5f5", background: "#eef2ff" }}>
              {notice}
            </div>
          ) : null}
          {outreachRows.length ? (
            <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
              {outreachRows.map((row) => {
                const tournament = row.tournaments ?? {};
                const contactName = row.contact_name ?? tournament.tournament_director ?? null;
                const contactEmail = row.contact_email ?? tournament.tournament_director_email ?? "";
                const doNotContact = Boolean(tournament.do_not_contact);
                const { subject, body } = row.email_subject_snapshot && row.email_body_snapshot
                  ? { subject: row.email_subject_snapshot, body: row.email_body_snapshot }
                  : renderOutreachTemplate(initialTemplate, tournament, contactName);
                const followup = row.followup_subject_snapshot && row.followup_body_snapshot
                  ? { subject: row.followup_subject_snapshot, body: row.followup_body_snapshot }
                  : renderOutreachTemplate(followupTemplate, tournament, contactName);
                const mailto = contactEmail ? buildMailto(contactEmail, subject, body) : "";
                const followupMailto = contactEmail ? buildMailto(contactEmail, followup.subject, followup.body) : "";

                return (
                  <details key={row.id} style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12, background: "#fff" }}>
                    <summary style={{ listStyle: "none", cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 900 }}>{tournament.name ?? "Unknown tournament"}</div>
                          <div style={{ fontSize: 12, color: "#666" }}>
                            {tournament.city ?? ""}{tournament.city && tournament.state ? ", " : ""}{tournament.state ?? ""}
                          </div>
                          <div style={{ fontSize: 12, color: "#666" }}>{contactEmail}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {doNotContact ? (
                            <div style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 999, background: "#fee2e2", color: "#991b1b", fontSize: 11, fontWeight: 800 }}>
                              DNC
                            </div>
                          ) : null}
                          <span style={{ fontSize: 12, color: "#444", fontWeight: 700 }}>Show ▾</span>
                        </div>
                      </div>
                    </summary>

                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {tournament.slug ? (
                          <Link href={buildTournamentUrl(tournament.slug)} target="_blank" style={{ fontSize: 12 }}>
                            View tournament ↗
                          </Link>
                        ) : null}
                      </div>

                      {!contactEmail ? (
                        <form action={updateTournamentEmailAction} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
                          <input type="hidden" name="tournament_id" value={tournament.id} />
                          <label style={{ fontSize: 12, fontWeight: 700 }}>
                            Add director email
                            <input
                              type="email"
                              name="tournament_director_email"
                              placeholder="director@email.com"
                              required
                              style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                            />
                          </label>
                          <button
                            type="submit"
                            style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#0f172a", color: "#fff", fontWeight: 800 }}
                          >
                            Save email
                          </button>
                        </form>
                      ) : null}

                      <OutreachCopyButtons
                        subject={subject}
                        body={body}
                        followupSubject={followup.subject}
                        followupBody={followup.body}
                        disabled={doNotContact}
                      />
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <a
                          href={mailto}
                          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #0f172a", background: doNotContact ? "#e5e7eb" : "#fff", color: "#0f172a", fontSize: 12, fontWeight: 800, textDecoration: "none", pointerEvents: doNotContact ? "none" : "auto" }}
                        >
                          Compose email
                        </a>
                        <a
                          href={followupMailto}
                          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #0f172a", background: doNotContact ? "#e5e7eb" : "#fff", color: "#0f172a", fontSize: 12, fontWeight: 800, textDecoration: "none", pointerEvents: doNotContact ? "none" : "auto" }}
                        >
                          Compose follow-up
                        </a>
                      </div>
                    </div>

                    <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <form action={markSent}>
                        <input type="hidden" name="outreach_id" value={row.id} />
                        <input type="hidden" name="subject" value={subject} />
                        <input type="hidden" name="body" value={body} />
                        <button
                          disabled={doNotContact}
                          style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: "#111", color: "#fff", fontSize: 12, fontWeight: 800, opacity: doNotContact ? 0.5 : 1 }}
                        >
                          Mark sent
                        </button>
                      </form>
                      <form action={markFollowupSent}>
                        <input type="hidden" name="outreach_id" value={row.id} />
                        <input type="hidden" name="subject" value={followup.subject} />
                        <input type="hidden" name="body" value={followup.body} />
                        <button
                          disabled={doNotContact}
                          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #111", background: "#fff", color: "#111", fontSize: 12, fontWeight: 800, opacity: doNotContact ? 0.5 : 1 }}
                        >
                          Mark follow-up sent
                        </button>
                      </form>
                      <form action={markReplied}>
                        <input type="hidden" name="outreach_id" value={row.id} />
                        <button
                          disabled={doNotContact}
                          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #111", background: "#fff", color: "#111", fontSize: 12, fontWeight: 800, opacity: doNotContact ? 0.5 : 1 }}
                        >
                          Mark replied
                        </button>
                      </form>
                      <form action={markVerified}>
                        <input type="hidden" name="outreach_id" value={row.id} />
                        <button
                          disabled={doNotContact}
                          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #111", background: "#fff", color: "#111", fontSize: 12, fontWeight: 800, opacity: doNotContact ? 0.5 : 1 }}
                        >
                          Mark verified
                        </button>
                      </form>
                    </div>

                    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                      <form action={updateOutreachNotes} style={{ display: "grid", gap: 6 }}>
                        <input type="hidden" name="outreach_id" value={row.id} />
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Notes
                          <textarea
                            name="notes"
                            defaultValue={row.notes ?? ""}
                            rows={2}
                            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
                          />
                        </label>
                        <button style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #111", background: "#fff", color: "#111", fontSize: 12, fontWeight: 800 }}>
                          Save notes
                        </button>
                      </form>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                        <form action={markDnc} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                          <input type="hidden" name="tournament_id" value={tournament.id} />
                          <select name="reason" defaultValue="opted_out" style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #ccc", fontSize: 12 }}>
                            {DNC_REASONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <button
                            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #b91c1c", background: "#fff", color: "#b91c1c", fontSize: 12, fontWeight: 800 }}
                          >
                            Mark Do Not Contact
                          </button>
                        </form>
                        {doNotContact ? (
                          <form action={clearDnc}>
                            <input type="hidden" name="tournament_id" value={tournament.id} />
                            <button
                              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #0f172a", background: "#fff", color: "#0f172a", fontSize: 12, fontWeight: 800 }}
                            >
                              Clear DNC
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          ) : (
            <div style={{ marginTop: 16, padding: 16, borderRadius: 12, border: "1px dashed #cbd5f5", color: "#555" }}>
              No outreach entries for this view.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
