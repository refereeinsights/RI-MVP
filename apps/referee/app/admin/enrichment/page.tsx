import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import {
  listTournamentEnrichmentProposals,
  getEnrichmentProposalCounts,
  type EnrichmentProposalWithContext,
  type EnrichmentProposalActionType,
} from "@/lib/tournaments/enrichmentProposals";
import { applyTournamentEnrichmentProposal } from "@/lib/tournaments/applyEnrichmentProposal";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Server Actions ───────────────────────────────────────────────────────────

async function approveProposal(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const proposalId = String(formData.get("proposal_id") ?? "");
  if (!proposalId) return;
  await (supabaseAdmin.from("tournament_enrichment_proposals" as any) as any)
    .update({
      status: "approved",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposalId);
  revalidatePath("/admin/enrichment");
}

async function rejectProposal(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const proposalId = String(formData.get("proposal_id") ?? "");
  const reason = String(formData.get("rejection_reason") ?? "").trim();
  if (!proposalId) return;
  await (supabaseAdmin.from("tournament_enrichment_proposals" as any) as any)
    .update({
      status: "rejected",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposalId);
  revalidatePath("/admin/enrichment");
}

async function markNeedsVerification(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const proposalId = String(formData.get("proposal_id") ?? "");
  if (!proposalId) return;
  await (supabaseAdmin.from("tournament_enrichment_proposals" as any) as any)
    .update({
      status: "needs_verification",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposalId);
  revalidatePath("/admin/enrichment");
}

async function applyProposal(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const proposalId = String(formData.get("proposal_id") ?? "");
  if (!proposalId) return;
  await applyTournamentEnrichmentProposal(proposalId, admin.id);
  revalidatePath("/admin/enrichment");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<EnrichmentProposalActionType, string> = {
  add_official_source: "Add official source",
  correct_dates: "Correct dates",
  add_venue: "Add venue",
  add_additional_venue: "Add additional venue",
  correct_venue: "Correct venue",
  correct_tournament_location: "Correct location",
  merge_duplicate: "Merge duplicate",
  manual_review: "Manual review",
};

const ACTION_COLORS: Record<EnrichmentProposalActionType, string> = {
  add_official_source: "#2563eb",
  correct_dates: "#7c3aed",
  add_venue: "#059669",
  add_additional_venue: "#059669",
  correct_venue: "#d97706",
  correct_tournament_location: "#0891b2",
  merge_duplicate: "#dc2626",
  manual_review: "#6b7280",
};

const STATUS_COLORS: Record<string, string> = {
  pending_review: "#d97706",
  needs_verification: "#7c3aed",
  approved: "#059669",
  rejected: "#dc2626",
  applied: "#2563eb",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "#059669",
  medium: "#d97706",
  low: "#dc2626",
};

function badge(label: string, color: string) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 7px", borderRadius: 4,
      background: color + "18", color, fontWeight: 700, fontSize: 11,
      border: `1px solid ${color}33`, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function fmtDate(v: string | null) {
  return v ? v.slice(0, 10) : "—";
}

function renderActionValue(
  actionType: EnrichmentProposalActionType,
  value: Record<string, unknown> | null,
  isProposed = false
) {
  if (!value) return <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>;
  const row = (key: string, val: unknown) =>
    val ? <div style={{ fontSize: 12, marginBottom: 2 }}><span style={{ color: "#6b7280", fontWeight: 600, minWidth: 80, display: "inline-block" }}>{key}:</span> {String(val)}</div> : null;

  switch (actionType) {
    case "add_official_source":
      return value.url
        ? <a href={String(value.url)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, wordBreak: "break-all" }}>{String(value.url)}</a>
        : <span style={{ color: "#9ca3af", fontSize: 12 }}>empty</span>;

    case "correct_dates":
      return <div>
        {row("Start", fmtDate(String(value.start_date ?? "")))}
        {row("End", fmtDate(String(value.end_date ?? "")))}
      </div>;

    case "add_venue":
    case "add_additional_venue":
    case "correct_venue":
      return <div>
        {isProposed === false && value.venue_id && row("Venue ID", String(value.venue_id).slice(0, 8) + "…")}
        {row("Name", value.name)}
        {row("Address", value.address)}
        {row("City", value.city)}
        {row("State", value.state)}
        {row("Zip", value.zip)}
      </div>;

    case "correct_tournament_location":
      return <div>
        {row("City", value.city)}
        {row("State", value.state)}
      </div>;

    case "merge_duplicate":
      return <div>
        {value.duplicate_name && row("Name", value.duplicate_name)}
        {value.duplicate_slug && <div style={{ fontSize: 12 }}>
          <span style={{ color: "#6b7280", fontWeight: 600, minWidth: 80, display: "inline-block" }}>Slug:</span>{" "}
          <a href={`https://www.tournamentinsights.com/tournaments/${value.duplicate_slug}`} target="_blank" rel="noopener noreferrer">{String(value.duplicate_slug)}</a>
        </div>}
        {value.duplicate_tournament_id && row("ID", String(value.duplicate_tournament_id).slice(0, 8) + "…")}
      </div>;

    case "manual_review":
      return value.issue
        ? <span style={{ fontSize: 12 }}>{String(value.issue)}</span>
        : <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>;

    default:
      return null;
  }
}

// ── Proposal Card ─────────────────────────────────────────────────────────────

function ProposalCard({ p }: { p: EnrichmentProposalWithContext }) {
  const t = p.tournament;
  const isActionable = p.status === "pending_review" || p.status === "needs_verification";
  const isApproved = p.status === "approved";
  const isTerminal = p.status === "rejected" || p.status === "applied";

  const cardStyle: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: "16px 20px",
    marginBottom: 16,
    background: "#fff",
    borderLeft: `4px solid ${STATUS_COLORS[p.status] ?? "#e5e7eb"}`,
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase",
    letterSpacing: "0.08em", marginBottom: 4,
  };

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          {t ? (
            <div>
              <a
                href={t.slug ? `https://www.tournamentinsights.com/tournaments/${t.slug}` : undefined}
                target="_blank" rel="noopener noreferrer"
                style={{ fontWeight: 700, fontSize: 14, color: "#111827", textDecoration: t.slug ? "underline" : "none" }}
              >
                {t.name ?? "Unknown tournament"}
              </a>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                {[t.sport, t.city && t.state ? `${t.city}, ${t.state}` : (t.city || t.state)].filter(Boolean).join(" · ")}
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 13, color: "#9ca3af" }}>Tournament not found</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {badge(ACTION_LABELS[p.action_type] ?? p.action_type, ACTION_COLORS[p.action_type] ?? "#6b7280")}
          {badge(p.confidence, CONFIDENCE_COLORS[p.confidence] ?? "#6b7280")}
          {badge(p.status.replace("_", " "), STATUS_COLORS[p.status] ?? "#6b7280")}
        </div>
      </div>

      {/* Current vs Proposed */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={sectionLabel}>Current</div>
          {renderActionValue(p.action_type, p.current_value, false)}
          {t && p.action_type === "add_official_source" && !p.current_value && (
            <span style={{ fontSize: 12, color: "#9ca3af" }}>{t.official_website_url ? t.official_website_url : "empty"}</span>
          )}
        </div>
        <div>
          <div style={sectionLabel}>Proposed</div>
          {renderActionValue(p.action_type, p.proposed_value, true)}
        </div>
      </div>

      {/* Linked venues */}
      {p.linked_venues.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={sectionLabel}>Current linked venues</div>
          <div style={{ fontSize: 12, color: "#374151" }}>
            {p.linked_venues.map(v => (
              <span key={v.id} style={{ marginRight: 8 }}>
                {v.name ?? v.id.slice(0, 8)}{v.city && v.state ? ` (${v.city}, ${v.state})` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Evidence */}
      <div style={{ background: "#f9fafb", borderRadius: 6, padding: "10px 12px", marginBottom: 12, fontSize: 12 }}>
        <div style={sectionLabel}>Evidence</div>
        {p.evidence_summary && <p style={{ margin: "0 0 4px", color: "#374151" }}>{p.evidence_summary}</p>}
        {p.research_notes && <p style={{ margin: "0 0 4px", color: "#6b7280", fontStyle: "italic" }}>{p.research_notes}</p>}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
          {p.source_url && <a href={p.source_url} target="_blank" rel="noopener noreferrer">Source ↗</a>}
          {p.venue_source_url && <a href={p.venue_source_url} target="_blank" rel="noopener noreferrer">Venue source ↗</a>}
        </div>
        <div style={{ color: "#9ca3af", marginTop: 4 }}>
          {p.proposed_by && <span>Proposed by: {p.proposed_by} · </span>}
          {p.researched_at && <span>Researched: {fmtDate(p.researched_at)} · </span>}
          {p.source_batch_id && <span>Batch: {p.source_batch_id}</span>}
        </div>
      </div>

      {/* Rejection reason (terminal state) */}
      {p.status === "rejected" && p.rejection_reason && (
        <div style={{ marginBottom: 10, fontSize: 12, color: "#dc2626" }}>
          Rejected: {p.rejection_reason}
        </div>
      )}

      {/* Applied record */}
      {p.status === "applied" && (
        <div style={{ marginBottom: 10, fontSize: 12, color: "#059669" }}>
          Applied {p.applied_at ? fmtDate(p.applied_at) : ""}
        </div>
      )}

      {/* Review controls */}
      {isActionable && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
          <form action={approveProposal}>
            <input type="hidden" name="proposal_id" value={p.id} />
            <button type="submit" style={btnStyle("#059669")}>Approve</button>
          </form>
          <form action={markNeedsVerification}>
            <input type="hidden" name="proposal_id" value={p.id} />
            <button type="submit" style={btnStyle("#7c3aed")}>Needs verification</button>
          </form>
          <form action={rejectProposal} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <input type="hidden" name="proposal_id" value={p.id} />
            <textarea
              name="rejection_reason"
              placeholder="Rejection reason (optional)"
              rows={1}
              style={{ fontSize: 12, padding: "4px 8px", borderRadius: 4, border: "1px solid #d1d5db", width: 200, resize: "vertical" }}
            />
            <button type="submit" style={btnStyle("#dc2626")}>Reject</button>
          </form>
        </div>
      )}

      {/* Apply — only when approved */}
      {isApproved && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <form action={applyProposal}>
            <input type="hidden" name="proposal_id" value={p.id} />
            <button
              type="submit"
              style={{
                ...btnStyle("#2563eb"),
                fontWeight: 900,
                padding: "6px 16px",
                fontSize: 13,
                border: "2px solid #2563eb",
              }}
            >
              Apply approved change →
            </button>
          </form>
          <span style={{ fontSize: 11, color: "#6b7280" }}>Mutates production after conflict check</span>
        </div>
      )}

      {isTerminal && (
        <div style={{ fontSize: 11, color: "#9ca3af" }}>
          Reviewed: {p.reviewed_at ? fmtDate(p.reviewed_at) : "—"}
        </div>
      )}
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: "4px 12px", borderRadius: 4, border: `1px solid ${color}`,
    background: color, color: "#fff", fontWeight: 700, fontSize: 12,
    cursor: "pointer", whiteSpace: "nowrap",
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function EnrichmentReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const get = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };

  const filters = {
    status: get("status"),
    action_type: get("action_type"),
    sport: get("sport"),
    state: get("state"),
  };

  const [counts, proposals] = await Promise.all([
    getEnrichmentProposalCounts(),
    listTournamentEnrichmentProposals({ ...filters, limit: 100 }),
  ]);

  const selectStyle: React.CSSProperties = {
    padding: "4px 8px", borderRadius: 4, border: "1px solid #d1d5db",
    fontSize: 13, background: "#fff",
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#374151", marginRight: 4 };

  const pendingTotal = counts.pending_review + counts.needs_verification;

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      <AdminNav />

      <div style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Tournament Enrichment Review</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
              Propose and approve targeted changes to existing production tournaments. Research writes here; production is only mutated via Apply.
            </p>
          </div>
          <Link href="/admin" style={{ fontSize: 12, color: "#6b7280" }}>← Back to admin</Link>
        </div>

        {/* Summary counts */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          {([
            ["Pending review", counts.pending_review, "#d97706"],
            ["Needs verification", counts.needs_verification, "#7c3aed"],
            ["Approved", counts.approved, "#059669"],
            ["Applied", counts.applied, "#2563eb"],
            ["Rejected", counts.rejected, "#dc2626"],
          ] as const).map(([label, count, color]) => (
            <div key={label} style={{ padding: "8px 14px", borderRadius: 6, border: `1px solid ${color}33`, background: `${color}0d` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{count}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <form method="GET" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 20, padding: "12px 16px", background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb" }}>
          <div>
            <label style={labelStyle}>Status</label>
            <select name="status" defaultValue={filters.status ?? ""} style={selectStyle}>
              <option value="">All statuses</option>
              <option value="pending_review">Pending review</option>
              <option value="needs_verification">Needs verification</option>
              <option value="approved">Approved</option>
              <option value="applied">Applied</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Action</label>
            <select name="action_type" defaultValue={filters.action_type ?? ""} style={selectStyle}>
              <option value="">All actions</option>
              <option value="add_official_source">Add official source</option>
              <option value="correct_dates">Correct dates</option>
              <option value="add_venue">Add venue</option>
              <option value="add_additional_venue">Add additional venue</option>
              <option value="correct_venue">Correct venue</option>
              <option value="correct_tournament_location">Correct location</option>
              <option value="merge_duplicate">Merge duplicate</option>
              <option value="manual_review">Manual review</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Sport</label>
            <input name="sport" defaultValue={filters.sport ?? ""} placeholder="e.g. soccer" style={{ ...selectStyle, width: 100 }} />
          </div>
          <div>
            <label style={labelStyle}>State</label>
            <input name="state" defaultValue={filters.state ?? ""} placeholder="e.g. CA" style={{ ...selectStyle, width: 60 }} maxLength={2} />
          </div>
          <button type="submit" style={{ ...btnStyle("#374151"), padding: "5px 14px" }}>Filter</button>
          <a href="/admin/enrichment" style={{ fontSize: 12, color: "#6b7280", alignSelf: "center" }}>Reset</a>
        </form>

        {/* Proposal list */}
        {proposals.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 14 }}>
            No proposals match the current filters.
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
              Showing {proposals.length} proposal{proposals.length !== 1 ? "s" : ""}
              {pendingTotal > 0 && !filters.status ? ` · ${pendingTotal} need attention` : ""}
            </div>
            {proposals.map(p => <ProposalCard key={p.id} p={p} />)}
          </div>
        )}
      </div>
    </main>
  );
}
