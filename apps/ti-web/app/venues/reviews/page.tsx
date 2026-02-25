import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";
import VenueReviewsClient from "./_components/VenueReviewsClient";

const RETURN_TO = "/venues/reviews";

export const metadata = {
  title: "Venue Reviews",
  description: "Insider venue review submission tool.",
  robots: { index: false, follow: false },
};

export default async function VenueReviewsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(RETURN_TO)}`);
  }

  const { tier } = await getTiTierServer(user);
  if (tier === "explorer") {
    redirect(`/account?notice=${encodeURIComponent("Insider required to submit venue reviews.")}`);
  }

  return <VenueReviewsClient />;
}
