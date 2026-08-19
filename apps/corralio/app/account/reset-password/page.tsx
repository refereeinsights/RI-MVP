import Link from "next/link";

import { PasswordForm } from "@/app/components/PasswordForm";
import { createCorralioSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  let authenticated = false;
  try {
    const supabase = createCorralioSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    authenticated = Boolean(data.user);
  } catch {
    authenticated = false;
  }

  return (
    <main className="authShell">
      <section className="authCard" aria-labelledby="reset-password-heading">
        <Link className="authBrand" href="/">Corralio</Link>
        <p className="eyebrow">Account recovery</p>
        <h1 id="reset-password-heading">Choose a new password</h1>
        {authenticated ? (
          <PasswordForm recovery />
        ) : (
          <>
            <p className="formNotice error" role="alert">This recovery session is missing or has expired. Request a new password-reset email.</p>
            <Link className="primaryLinkButton" href="/account/forgot-password">Request a new reset email</Link>
          </>
        )}
      </section>
    </main>
  );
}
