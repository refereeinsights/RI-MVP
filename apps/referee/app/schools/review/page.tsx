import Link from "next/link";
import { notFound } from "next/navigation";
import SchoolReviewForm from "./SchoolReviewForm";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { userIsVerifiedReferee } from "@/lib/refereeVerification";

export const metadata = {
  title: "Submit a School Review | Referee Insights",
  description: "Verified referees can submit field and facility reviews for schools.",
};

export default async function SchoolReviewPage({
  searchParams,
}: {
  searchParams?: {
    school_id?: string;
    intent?: string;
    entity_type?: string;
    school_slug?: string;
    source_url?: string;
  };
}) {
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

  const intent = (searchParams?.intent ?? "").trim();
  const entityType = (searchParams?.entity_type ?? "").trim();
  const schoolId = (searchParams?.school_id ?? "").trim();
  const schoolSlug = (searchParams?.school_slug ?? "").trim();
  const sourceUrl = (searchParams?.source_url ?? "").trim();

  let initialSchool = null;
  if (schoolId || schoolSlug) {
    const { data: school } = await supabase
      .from("schools")
      .select("id,name,city,state,address,slug")
      .or(
        [
          schoolId ? `id.eq.${schoolId}` : "",
          schoolSlug ? `slug.eq.${schoolSlug}` : "",
        ]
          .filter(Boolean)
          .join(",")
      )
      .maybeSingle();
    if (!school) {
      return notFound();
    }
    initialSchool = {
      id: school.id,
      name: school.name ?? "Unnamed school",
      city: school.city ?? "",
      state: school.state ?? "",
      address: school.address ?? null,
      slug: school.slug ?? null,
    };
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 80px" }}>
      <header style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 14, letterSpacing: 1.2, textTransform: "uppercase", color: "#1a4a36" }}>
          Referee Insights
        </p>
        <h1 style={{ fontSize: 36, margin: "6px 0" }}>Submit a school review</h1>
        <p style={{ color: "rgba(0,0,0,0.75)", lineHeight: 1.6 }}>
          Use the Google Places search to confirm the school name and location. Rate fields, site access,
          pay, and support so other referees know what to expect before accepting assignments.
        </p>
        <div style={{ marginTop: 12 }}>
          <Link href="/schools" style={{ color: "#0f3d2e", fontWeight: 600 }}>
            ← Back to school reviews
          </Link>
        </div>
      </header>

      <SchoolReviewForm
        canSubmit={canSubmit}
        disabledMessage={disabledMessage}
        initialSchool={initialSchool}
        claimIntent={intent === "claim" && entityType === "school"}
        claimSourceUrl={sourceUrl}
      />
    </main>
  );
}
