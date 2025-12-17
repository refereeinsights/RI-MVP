import SchoolReviewForm from "./SchoolReviewForm";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { userIsVerifiedReferee } from "@/lib/refereeVerification";

export const metadata = {
  title: "School Reviews | Referee Insights",
  description: "Verified referees can submit field and facilities reviews for schools they have worked.",
};

export default async function SchoolReviewPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let canSubmit = false;
  let disabledMessage = "Sign in to submit a school review.";

  if (user) {
    const verified = await userIsVerifiedReferee(supabase, user.id);
    if (verified) {
      canSubmit = true;
      disabledMessage = "";
    } else {
      disabledMessage = "Only verified referees can submit school reviews.";
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 80px" }}>
      <header style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 14, letterSpacing: 1.2, textTransform: "uppercase", color: "#1a4a36" }}>
          Referee Insights
        </p>
        <h1 style={{ fontSize: 38, margin: "6px 0" }}>School field & facilities reviews</h1>
        <p style={{ color: "rgba(0,0,0,0.75)", lineHeight: 1.6 }}>
          Help other referees understand what it&apos;s like to work games at a specific school. Search for the school using Google Places, confirm the address, and rate the logistics, facilities, support, and pay accuracy of your assignments there.
        </p>
      </header>

      <SchoolReviewForm canSubmit={canSubmit} disabledMessage={disabledMessage} />
    </main>
  );
}
