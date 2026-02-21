import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import ResendVerificationForm from "./ResendVerificationForm";

export default async function VerifyEmailPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email_confirmed_at) {
    redirect("/account");
  }

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem", display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Verify your email</h1>
      <p style={{ margin: 0, color: "#475569" }}>
        Email verification is required to unlock Insider access. Once your email is verified, you can use your account and manage your tier from Account.
      </p>
      <ResendVerificationForm initialEmail={user?.email ?? ""} />
      <div style={{ fontSize: 13 }}>
        Already verified? <Link href="/login">Log in</Link>
      </div>
    </main>
  );
}
