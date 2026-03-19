import { redirect } from "next/navigation";

export default function AssignmentsPage() {
  // Keep the new header link stable even though RI doesn't have a dedicated
  // assignments page yet.
  redirect("/assignors");
}

