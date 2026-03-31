import Link from "next/link";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyUnsubscribeToken, type UnsubscribeScope } from "../../../../shared/email/unsubscribeToken";

type SearchParams = {
  email?: string;
  scope?: string;
  exp?: string;
  sig?: string;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

function parseScope(value: string | undefined): UnsubscribeScope | null {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "marketing") return "marketing";
  if (v === "all") return "all";
  return null;
}

export default async function UnsubscribePage({ searchParams }: { searchParams?: SearchParams }) {
  const email = (searchParams?.email ?? "").trim().toLowerCase();
  const scope = parseScope(searchParams?.scope);
  const exp = Number((searchParams?.exp ?? "").trim());
  const sig = (searchParams?.sig ?? "").trim();
  const secret = (process.env.EMAIL_UNSUBSCRIBE_SECRET ?? "").trim();

  let completed = false;
  let errorMessage = "";

  if (!email || !scope || !sig || !Number.isFinite(exp) || !secret) {
    errorMessage = !secret
      ? "Unsubscribe is not configured."
      : "This unsubscribe link is invalid or incomplete.";
  } else {
    const ok = verifyUnsubscribeToken({ email, scope, exp, sig, secret });
    if (!ok) {
      errorMessage = "This unsubscribe link is invalid or has expired.";
    } else {
      const upsertRow =
        scope === "all"
          ? { email, suppress_marketing: true, suppress_all: true, reason: "one_click_unsubscribe" }
          : { email, suppress_marketing: true, suppress_all: false, reason: "one_click_unsubscribe" };

      const { error } = await (supabaseAdmin.from("email_suppressions" as any) as any).upsert(upsertRow, {
        onConflict: "email",
      });
      if (error) errorMessage = error.message;
      else completed = true;
    }
  }

  return (
    <main className="page">
      <div className="shell" style={{ maxWidth: 760 }}>
        <section className="bodyCard" style={{ display: "grid", gap: 16, textAlign: "center" }}>
          <div style={{ display: "grid", gap: 8 }}>
            <h1 style={{ margin: 0 }}>{completed ? "You’re unsubscribed" : "Unable to unsubscribe"}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {completed
                ? scope === "all"
                  ? "We’ll stop sending emails to this address."
                  : "We’ll stop sending marketing emails to this address."
                : errorMessage}
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <Link href="/" className="cta ti-home-cta ti-home-cta-primary">
              Back to TournamentInsights
            </Link>
            <Link href="/account" className="cta ti-home-cta ti-home-cta-secondary">
              Account settings
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
