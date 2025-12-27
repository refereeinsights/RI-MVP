import OwlsEyePanel from "./OwlsEyePanel";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export default async function OwlsEyeAdminPage() {
  await requireAdmin();
  return <OwlsEyePanel />;
}
