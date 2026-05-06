import Link from "next/link";

import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";

import DiscoveryWorkbenchClient from "./DiscoveryWorkbenchClient";

export const runtime = "nodejs";

export default async function TiDiscoveryPage() {
  await requireAdmin();

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 950, marginBottom: 10 }}>TI Discovery</h1>
      <div style={{ marginBottom: 12 }}>
        <AdminNav />
      </div>
      <div style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Link href="/admin" className="cta secondary" style={{ padding: "8px 12px" }}>
          ← Back to Admin
        </Link>
        <Link href="/admin/ti/seasons" className="cta secondary" style={{ padding: "8px 12px" }}>
          TI Seasons →
        </Link>
        <Link href="/admin?tab=tournament-uploads" className="cta secondary" style={{ padding: "8px 12px" }}>
          Tournament Uploads →
        </Link>
      </div>

      <DiscoveryWorkbenchClient />
    </div>
  );
}
