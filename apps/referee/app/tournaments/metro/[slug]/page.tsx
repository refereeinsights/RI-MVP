import { redirect } from "next/navigation";

export const runtime = "nodejs";

export default function MetroRedirectPage({ params }: { params: { slug: string } }) {
  const slug = (params.slug ?? "").trim().toLowerCase();
  redirect(`/tournaments?metro=${encodeURIComponent(slug)}`);
}

