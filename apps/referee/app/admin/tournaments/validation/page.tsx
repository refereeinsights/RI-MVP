import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminNav from "@/components/admin/AdminNav";
import { bulkApprove, bulkApproveOverwrite, bulkRequeue } from "./actions";

export const runtime = "nodejs";

type ValidationRow = {
  id: string;
  tournament_id: string;
  name: string | null;
  sport: string | null;
  validated_sport: string | null;
  validation_status: string | null;
  validation_method: string | null;
  rule_name: string | null;
  confidence_score: number | null;
  processed_at: string | null;
};

function Badge({ children, tone }: { children: React.ReactNode; tone?: "success" | "warn" | "info" }) {
  const color =
    tone === "success" ? "#0b8a4a" : tone === "warn" ? "#b45309" : tone === "info" ? "#2563eb" : "#444";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        background: "rgba(0,0,0,0.04)",
        border: `1px solid ${color}33`,
        color,
        fontSize: 12,
      }}
    >
      {children}
    </span>
  );
}

export default async function ValidationQueue() {
  await requireAdmin();

  const { data } = await supabaseAdmin
    .from("tournament_sport_validation" as any)
    .select(
      "id,tournament_id,validation_status,validation_method,validated_sport,rule_name,confidence_score,processed_at,tournaments(name,sport)"
    )
    .order("processed_at", { ascending: true })
    .limit(200);

  const rows: ValidationRow[] =
    (data as any[])?.map((row) => ({
      id: row.id,
      tournament_id: row.tournament_id,
      validation_status: row.validation_status,
      validation_method: row.validation_method,
      validated_sport: row.validated_sport,
      rule_name: row.rule_name,
      confidence_score: row.confidence_score,
      processed_at: row.processed_at,
      name: row.tournaments?.name ?? null,
      sport: row.tournaments?.sport ?? null,
    })) ?? [];

  return (
    <main className="adminShell">
      <AdminNav active="tournaments" />
      <div className="adminBody">
        <h1 style={{ marginBottom: 12 }}>Tournament Sport Validation</h1>
        <p style={{ color: "#444", marginBottom: 16 }}>
          Select rows to approve. “Approve + Overwrite” will set the tournament sport to the validated sport when present.
        </p>
        <div style={{ marginBottom: 12 }}>
          <a className="cta secondary" href="/admin/tournaments/validation/rules">
            Manage rules
          </a>
        </div>
        <form action={bulkApprove}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button type="submit" className="cta primary" style={{ padding: "8px 12px" }}>
              Bulk Approve
            </button>
            <button
              formAction={bulkApproveOverwrite}
              type="submit"
              className="cta secondary"
              style={{ padding: "8px 12px" }}
            >
              Bulk Approve + Overwrite Sport
            </button>
            <button
              formAction={bulkRequeue}
              type="submit"
              className="cta secondary"
              style={{ padding: "8px 12px", background: "#fef3c7", color: "#92400e" }}
            >
              Mark for Revalidate
            </button>
          </div>
          <table className="adminTable">
            <thead>
              <tr>
                <th></th>
                <th>Tournament</th>
                <th>Current</th>
                <th>Validated</th>
                <th>Status</th>
                <th>Rule</th>
                <th>Confidence</th>
                <th>Processed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input type="checkbox" name="selected" value={row.id} />
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{row.name ?? "Unnamed"}</div>
                    <div style={{ fontSize: 12, color: "#555" }}>{row.tournament_id}</div>
                  </td>
                  <td>{row.sport ?? "—"}</td>
                  <td>{row.validated_sport ?? "—"}</td>
                  <td>
                    <Badge
                      tone={
                        row.validation_status === "confirmed" || row.validation_status === "rule_confirmed"
                          ? "success"
                          : row.validation_status === "conflict"
                          ? "warn"
                          : "info"
                      }
                    >
                      {row.validation_status ?? "needs_review"}
                    </Badge>
                  </td>
                  <td>{row.rule_name ?? "—"}</td>
                  <td>{row.confidence_score ? row.confidence_score.toFixed(2) : "—"}</td>
                  <td>{row.processed_at ? new Date(row.processed_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </form>
      </div>
    </main>
  );
}
