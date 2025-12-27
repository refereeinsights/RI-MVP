import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin";
import OwlsEyePanel from "./OwlsEyePanel";

export const runtime = "nodejs";

export default async function OwlsEyeAdminPage({ searchParams }: { searchParams?: { venueId?: string } }) {
  await requireAdmin();
  const adminToken = process.env.NEXT_PUBLIC_OWLS_EYE_ADMIN_TOKEN ?? process.env.OWLS_EYE_ADMIN_TOKEN ?? "";
  const venueId = searchParams?.venueId ?? "";

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <OwlsEyePanel embedded adminToken={adminToken || undefined} initialVenueId={venueId || undefined} />
    </div>
  );
}
