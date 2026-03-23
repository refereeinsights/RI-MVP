import { requireTiOutreachAdmin } from "@/lib/outreachAdmin";
import OutreachReplyTool from "./ui/OutreachReplyTool";

export const dynamic = "force-dynamic";

export default async function OutreachReplyPage() {
  await requireTiOutreachAdmin("/admin/outreach-reply");

  return (
    <div style={{ padding: "18px 18px 60px 18px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Outreach Reply Template</h1>
          <div style={{ marginTop: 6, color: "#475569" }}>
            Generate a second-step email (includes per-tournament verify links) for a specific director email.
          </div>
        </div>
        <a href="/admin/outreach-previews" style={{ color: "#2563EB", fontWeight: 700 }}>
          Back to previews
        </a>
      </div>

      <div style={{ height: 18 }} />
      <OutreachReplyTool />
    </div>
  );
}
