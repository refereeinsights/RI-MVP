import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminNav from "@/components/admin/AdminNav";

export const runtime = "nodejs";

type RuleRow = {
  id: string;
  rule_name: string;
  rule_type: string;
  pattern: string;
  detected_sport: string;
  confidence_score: number | null;
  auto_confirm: boolean | null;
  priority: number | null;
  active: boolean | null;
  notes: string | null;
};

async function toggleActive(id: string, active: boolean) {
  "use server";
  await requireAdmin();
  await supabaseAdmin.from("sport_validation_rules" as any).update({ active }).eq("id", id);
}

async function saveRule(formData: FormData) {
  "use server";
  await requireAdmin();
  const rule_name = String(formData.get("rule_name") ?? "").trim();
  const rule_type = String(formData.get("rule_type") ?? "").trim();
  const pattern = String(formData.get("pattern") ?? "").trim();
  const detected_sport = String(formData.get("detected_sport") ?? "").trim();
  const confidence_score = Number(formData.get("confidence_score") ?? "1");
  const auto_confirm = formData.get("auto_confirm") === "on";
  const priority = Number(formData.get("priority") ?? "100");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!rule_name || !rule_type || !pattern || !detected_sport) return;

  await supabaseAdmin.from("sport_validation_rules" as any).upsert({
    rule_name,
    rule_type,
    pattern,
    detected_sport,
    confidence_score,
    auto_confirm,
    priority,
    active: true,
    notes,
    updated_at: new Date().toISOString(),
  });
}

export default async function RulesAdmin() {
  await requireAdmin();
  const { data } = await supabaseAdmin
    .from("sport_validation_rules" as any)
    .select("*")
    .order("priority", { ascending: false });
  const rules: RuleRow[] = (data as RuleRow[] | null) ?? [];

  return (
    <main className="adminShell">
      <AdminNav active="tournaments" />
      <div className="adminBody">
        <h1 style={{ marginBottom: 12 }}>Sport Validation Rules</h1>
        <details style={{ marginBottom: 16 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Add / Update Rule</summary>
          <form action={saveRule} method="post" style={{ display: "grid", gap: 8, paddingTop: 8 }}>
            <input name="rule_name" placeholder="rule_name (unique)" required />
            <select name="rule_type" required>
              <option value="host_contains">host_contains</option>
              <option value="url_contains">url_contains</option>
              <option value="name_contains">name_contains</option>
              <option value="organizer_contains">organizer_contains</option>
              <option value="regex">regex</option>
            </select>
            <input name="pattern" placeholder="pattern" required />
            <input name="detected_sport" placeholder="detected sport" required />
            <label>
              Confidence
              <input name="confidence_score" type="number" step="0.01" defaultValue="1" />
            </label>
            <label>
              Priority
              <input name="priority" type="number" defaultValue="100" />
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" name="auto_confirm" defaultChecked />
              Auto-confirm
            </label>
            <textarea name="notes" placeholder="notes (optional)" />
            <button type="submit" className="cta primary" style={{ width: "fit-content" }}>
              Save rule
            </button>
          </form>
        </details>

        <table className="adminTable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Pattern</th>
              <th>Sport</th>
              <th>Confidence</th>
              <th>Priority</th>
              <th>Auto</th>
              <th>Active</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td>{rule.rule_name}</td>
                <td>{rule.rule_type}</td>
                <td>{rule.pattern}</td>
                <td>{rule.detected_sport}</td>
                <td>{rule.confidence_score ?? "—"}</td>
                <td>{rule.priority ?? "—"}</td>
                <td>{rule.auto_confirm ? "yes" : "no"}</td>
                <td>
                  <form action={async () => toggleActive(rule.id, !rule.active)} method="post">
                    <button type="submit" className="cta secondary" style={{ padding: "4px 8px" }}>
                      {rule.active ? "Disable" : "Enable"}
                    </button>
                  </form>
                </td>
                <td style={{ maxWidth: 240, whiteSpace: "pre-wrap" }}>{rule.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
