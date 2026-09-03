import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/actions";
import { BrandLogo } from "@/app/components/BrandLogo";
import { PasswordForm } from "@/app/components/PasswordForm";
import { PhoneChangeForm } from "@/app/components/PhoneChangeForm";
import { readPhoneAuthConfiguration } from "@/lib/phoneAuth";
import { createCorralioSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  let user = null;
  try {
    const supabase = createCorralioSupabaseServerClient();
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }
  if (!user) redirect("/");

  return (
    <main className="authShell">
      <section className="authCard" aria-labelledby="account-password-heading">
        <div className="authCardHeader">
          <Link className="authBrand" href="/" aria-label="Corralio home"><BrandLogo /></Link>
          <form action={signOut}><button className="quietButton" type="submit">Sign out</button></form>
        </div>
        <p className="eyebrow">Account security</p>
        <h1 id="account-password-heading">Password</h1>
        <p className="sectionIntro">Set or update the password for your shared account. This password also protects this identity in TournamentInsights and RefereeInsights where password sign-in is supported.</p>
        <PasswordForm />
        {readPhoneAuthConfiguration(process.env).enabled ? <PhoneChangeForm /> : null}
        <Link className="authTextLink" href="/">Back to your family planner</Link>
      </section>
    </main>
  );
}
