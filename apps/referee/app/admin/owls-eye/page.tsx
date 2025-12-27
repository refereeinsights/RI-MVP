import { requireAdmin } from "@/lib/admin";
import OwlsEyePanel from "./OwlsEyePanel";

export const runtime = "nodejs";

export default async function OwlsEyeAdminPage() {
  await requireAdmin();
  const adminToken = process.env.NEXT_PUBLIC_OWLS_EYE_ADMIN_TOKEN ?? process.env.OWLS_EYE_ADMIN_TOKEN ?? "";
  return <OwlsEyePanel adminToken={adminToken || undefined} />;
}
