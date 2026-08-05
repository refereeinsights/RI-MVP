import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import {
  buildRiAnalyticsDashboardEmail,
  loadRiAnalyticsDashboardSummary,
  parseRiAdminDashboardRecipients,
  sendRiAnalyticsDashboardEmail,
} from "@/lib/riAdminDashboardEmail";
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function sendNowAction() {
  "use server";

  await requireAdmin();
  try {
    await sendRiAnalyticsDashboardEmail();
    redirect("/admin/dashboard-email?notice=sent");
  } catch (error) {
    console.error("[ri_admin_dashboard_email] manual send failed", error);
    redirect("/admin/dashboard-email?notice=send_failed");
  }
}

export default async function RiAdminDashboardEmailPage({
  searchParams,
}: {
  searchParams?: { notice?: string };
}) {
  await requireAdmin();

  const recipients = parseRiAdminDashboardRecipients();
  let summary:
    | Awaited<ReturnType<typeof loadRiAnalyticsDashboardSummary>>
    | null = null;
  let preview:
    | ReturnType<typeof buildRiAnalyticsDashboardEmail>
    | null = null;
  let loadError: string | null = null;

  try {
    summary = await loadRiAnalyticsDashboardSummary();
    preview = buildRiAnalyticsDashboardEmail(summary);
  } catch (error: any) {
    console.error("[ri_admin_dashboard_email] page load failed", error);
    loadError = error?.message ? String(error.message) : "Unknown dashboard email preview error.";
  }

  return (
    <main className="pitchWrap">
      <section className="field">
        <AdminNav />
        <div className="headerBlock brandedHeader">
          <h1 className="title" style={{ fontSize: "2rem", fontWeight: 700 }}>
            RI Admin Dashboard Email
          </h1>
          <p className="subtitle" style={{ maxWidth: 760, fontSize: 14, lineHeight: 1.6 }}>
            Daily RefereeInsights analytics summary for persisted RI action events. Uses the same `ri_analytics_events`
            data as `/admin/analytics`.
          </p>
        </div>

        {searchParams?.notice === "sent" ? (
          <div style={{ marginBottom: 16, color: "#166534", fontWeight: 700 }}>Dashboard email sent.</div>
        ) : null}
        {searchParams?.notice === "send_failed" ? (
          <div style={{ marginBottom: 16, color: "#991b1b", fontWeight: 700 }}>
            Dashboard email send failed. Check runtime logs and email configuration.
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(260px, 340px) 1fr" }}>
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 16 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Recipients</h2>
            <div style={{ fontSize: 13, color: "#111827", lineHeight: 1.6 }}>
              {recipients.length > 0 ? recipients.map((recipient) => <div key={recipient}>{recipient}</div>) : "No recipients configured."}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
              Reads `RI_ADMIN_DASHBOARD_EMAILS`, falling back to `RI_ADMIN_EMAIL`.
            </div>
            <form action={sendNowAction} style={{ marginTop: 16 }}>
              <button
                type="submit"
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Send now
              </button>
            </form>
          </section>

          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 16 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Preview summary</h2>
            {loadError ? (
              <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
                <div style={{ color: "#991b1b", fontWeight: 700 }}>
                  Preview unavailable: {loadError}
                </div>
                <div style={{ color: "#475569" }}>
                  The admin email route can still be tested once this preview issue is resolved. Confirm
                  `ri_analytics_events`, admin recipients, and Resend env on the deployed RI app.
                </div>
              </div>
            ) : summary && preview ? (
              <>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                  <div>
                    <strong>Subject:</strong> {preview.subject}
                  </div>
                  <div>
                    <strong>Events:</strong> {summary.totalEvents}
                  </div>
                  <div>
                    <strong>Unique events:</strong> {summary.uniqueEventNames}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                  <div>
                    <strong>Venue hotel module viewed:</strong> {summary.hotelMetrics.moduleViewed}
                  </div>
                  <div>
                    <strong>Venue hotel results loaded:</strong> {summary.hotelMetrics.resultsLoaded}
                  </div>
                  <div>
                    <strong>Venue hotel no-results:</strong> {summary.hotelMetrics.noResults}
                  </div>
                  <div>
                    <strong>Venue hotel card clicks:</strong> {summary.hotelMetrics.cardClicks}
                  </div>
                  <div>
                    <strong>Venue fallback hotel CTA clicks:</strong> {summary.hotelMetrics.fallbackClicks}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: "#6b7280" }}>No preview available.</div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
