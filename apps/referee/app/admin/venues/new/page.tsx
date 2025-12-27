import AdminNav from "@/components/admin/AdminNav";
import NewVenueForm from "@/components/admin/NewVenueForm";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export default async function NewVenuePage() {
  await requireAdmin();

  return (
    <div style={{ padding: 24 }}>
      <AdminNav />
      <h1 style={{ margin: "0 0 8px" }}>New Venue</h1>
      <p style={{ margin: "0 0 16px", color: "#4b5563" }}>Create a venue to run Owl&apos;s Eye.</p>
      <NewVenueForm />
    </div>
  );
}
