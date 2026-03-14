import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminNav from "@/components/admin/AdminNav";
import {
  bulkApproveForm,
  bulkApproveOverwriteForm,
  bulkRequeueForm,
  runBatchForm,
  approveWithSportForm,
} from "./actions";
import { getSportValidationCounts } from "@/lib/validation/getSportValidationCounts";

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

function Tile({ label, value, tone }: { label: string; value: number | string; tone?: "warn" | "info" | "success" }) {
  const bg =
    tone === "warn" ? "#fef3c7" : tone === "success" ? "#ecfdf3" : tone === "info" ? "#eff6ff" : "#f9fafb";
  const color =
    tone === "warn" ? "#92400e" : tone === "success" ? "#166534" : tone === "info" ? "#1d4ed8" : "#111827";
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid rgba(0,0,0,0.06)",
        background: bg,
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

export default async function ValidationQueue() {
  await requireAdmin();
  const countsPromise = getSportValidationCounts();

  const { data } = await supabaseAdmin
    .from("tournament_sport_validation" as any)
    .select(
      "id,tournament_id,validation_status,validation_method,validated_sport,rule_name,confidence_score,processed_at,tournaments(name,sport,slug,official_website_url)"
    )
    .not("validation_status", "in", "(confirmed,rule_confirmed)")
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
      slug: row.tournaments?.slug ?? null,
      official_website_url: row.tournaments?.official_website_url ?? null,
    })) ?? [];

  const counts = await countsPromise;

  return (
    <main className="adminShell">
      <AdminNav active="tournaments" />
      <div className="adminBody">
        <h1 style={{ marginBottom: 12 }}>Tournament Sport Validation</h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <Tile label="Validated" value={counts.confirmed + counts.rule_confirmed} />
          <Tile label="Rule confirmed" value={counts.rule_confirmed} />
          <Tile label="Needs review" value={counts.needs_review} />
          <Tile label="Conflicts" value={counts.conflict} tone="warn" />
          <Tile label="Unknown" value={counts.unknown} tone="info" />
          <Tile label="Unconfirmed" value={counts.unconfirmed} />
        </div>
        <p style={{ color: "#444", marginBottom: 16 }}>
          Select rows to approve. “Approve + Overwrite” will set the tournament sport to the validated sport when present.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <a className="cta secondary" href="/admin/tournaments/validation/rules">
            Manage rules
          </a>
          <form action={runBatchForm} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#444" }}>
              Limit
              <input
                name="limit"
                type="number"
                min={1}
                defaultValue={200}
                style={{ width: 80, padding: 6, borderRadius: 8, border: "1px solid #ccc", marginLeft: 6 }}
              />
            </label>
            <button type="submit" className="cta secondary" style={{ padding: "8px 12px" }}>
              Run batch
            </button>
          </form>
        </div>
        <form action={bulkApproveForm}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button type="submit" className="cta primary" style={{ padding: "8px 12px" }}>
              Bulk Approve
            </button>
            <button
              formAction={bulkApproveOverwriteForm}
              type="submit"
              className="cta secondary"
              style={{ padding: "8px 12px" }}
            >
              Bulk Approve + Overwrite Sport
            </button>
            <button
              formAction={bulkRequeueForm}
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
                <tr key={row.id} data-tid={row.tournament_id}>
                  <td>
                    <input type="checkbox" name="selected" value={row.id} />
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {row.official_website_url ? (
                        <a href={row.official_website_url} target="_blank" rel="noopener noreferrer">
                          {row.name ?? "Unnamed"}
                        </a>
                      ) : row.slug ? (
                        <a href={`/tournaments/${row.slug}`} target="_blank" rel="noopener noreferrer">
                          {row.name ?? "Unnamed"}
                        </a>
                      ) : (
                        row.name ?? "Unnamed"
                      )}
                    </div>
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
        {/* Inline per-row override */}
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
          <h3 style={{ margin: 0, marginBottom: 8 }}>Set sport and approve (single row)</h3>
          <p style={{ fontSize: 13, color: "#555", marginTop: 0, marginBottom: 8 }}>
            Select a row checkbox, choose a sport, and click approve. Overwrite will also update the tournament sport.
          </p>
          <form action={approveWithSportForm} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select name="validated_sport" required style={{ padding: 6, borderRadius: 8, border: "1px solid #ccc" }}>
              <option value="">Choose sport</option>
              {["soccer","basketball","baseball","softball","lacrosse","hockey","volleyball","football","futsal"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" name="overwrite" value="true" />
              Overwrite tournament sport
            </label>
            <input type="hidden" name="tournament_id" id="single-tid" />
            <input type="hidden" name="validation_id" id="single-vid" />
            <button type="submit" className="cta primary" style={{ padding: "8px 12px" }}>
              Approve selected row
            </button>
          </form>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  const form = document.currentScript?.previousElementSibling;
                  if (!form) return;
                  const tidInput = form.querySelector('#single-tid');
                  const vidInput = form.querySelector('#single-vid');
                  const checkboxes = document.querySelectorAll('input[type="checkbox"][name="selected"]');
                  form.addEventListener('submit', (e) => {
                    const checked = Array.from(checkboxes).find((c) => (c as HTMLInputElement).checked);
                    if (!checked) {
                      e.preventDefault();
                      alert('Select a row checkbox first.');
                      return false;
                    }
                    const tr = checked.closest('tr');
                    if (!tr) return;
                    const tid = tr.getAttribute('data-tid');
                    const vid = (checked as HTMLInputElement).value;
                    if (tidInput) tidInput.value = tid || '';
                    if (vidInput) vidInput.value = vid || '';
                  });
                })();
              `,
            }}
          />
        </div>
      </div>
    </main>
  );
}
