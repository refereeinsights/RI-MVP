import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

function buildClaimPath(sessionId: string) {
  const qp = new URLSearchParams({ session_id: sessionId });
  return `/premium/claim?${qp.toString()}`;
}

export default async function PremiumSuccessPage({
  searchParams,
}: {
  searchParams?: { session_id?: string };
}) {
  const sessionId = (searchParams?.session_id ?? "").trim();
  if (!sessionId) {
    redirect("/premium?notice=missing_session");
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.mode !== "subscription") {
    redirect("/premium?notice=unsupported_session");
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const claimPath = buildClaimPath(sessionId);

  // If already logged in (same browser), claim immediately.
  if (user?.id) {
    redirect(claimPath);
  }

  return (
    <main className="page">
      <div className="shell">
        <section className="hero" aria-labelledby="upgrade-success-title">
          <h1 id="upgrade-success-title">Payment received</h1>
          <p className="muted heroCopy" style={{ marginTop: 0 }}>
            Next, create a free TournamentInsights account (or log in) to unlock Weekend Pro on this device and manage billing.
          </p>
          <div style={{ display: "grid", gap: 10, justifyItems: "center", marginTop: 16 }}>
            <Link className="primaryLink" href={`/signup?returnTo=${encodeURIComponent(claimPath)}`}>
              Create free account
            </Link>
            <Link className="secondaryLink" href={`/login?returnTo=${encodeURIComponent(claimPath)}`}>
              Log in to unlock
            </Link>
          </div>
          <p className="muted" style={{ marginTop: 16, fontSize: 13, maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
            Use the same email you used at checkout so we can attach this subscription to your account.
          </p>
        </section>
      </div>
    </main>
  );
}

