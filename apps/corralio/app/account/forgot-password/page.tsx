import Link from "next/link";

import { ForgotPasswordForm } from "@/app/components/ForgotPasswordForm";
import { BrandLogo } from "@/app/components/BrandLogo";

export default function ForgotPasswordPage() {
  return (
    <main className="authShell">
      <section className="authCard" aria-labelledby="forgot-password-heading">
        <Link className="authBrand" href="/" aria-label="Corralio home"><BrandLogo /></Link>
        <p className="eyebrow">Account recovery</p>
        <h1 id="forgot-password-heading">Forgot your password?</h1>
        <p className="sectionIntro">Enter your email and we’ll send password-reset instructions if an account exists.</p>
        <ForgotPasswordForm />
        <Link className="authTextLink" href="/">Back to sign in</Link>
      </section>
    </main>
  );
}
