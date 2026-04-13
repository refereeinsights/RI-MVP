import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import ResendVerificationForm from "./ResendVerificationForm";

function sanitizeReturnTo(value: string | null, fallback = "/account") {
  const raw = (value ?? "").trim();
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  return raw;
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: { returnTo?: string; email?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const returnTo = sanitizeReturnTo(searchParams?.returnTo ?? null, "/account");
  const email = String(searchParams?.email ?? "").trim();

  if (user?.email_confirmed_at) {
    redirect(returnTo);
  }

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem", display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Verify your email</h1>
      <p style={{ margin: 0, color: "#475569" }}>
        Email verification is required to finish setting up your account.
      </p>
      <ResendVerificationForm initialEmail={user?.email ?? email} returnTo={returnTo} />
      <div style={{ fontSize: 13 }}>
        Already verified? <Link href={`/account/login`}>Log in</Link>
      </div>
    </main>
  );
}

