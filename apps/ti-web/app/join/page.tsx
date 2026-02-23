import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

function normalizeCode(value: string | null | undefined) {
  return (value ?? "").trim();
}

export default async function JoinPage({
  searchParams,
}: {
  searchParams?: { code?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const code = normalizeCode(searchParams?.code);
  const error = normalizeCode(searchParams?.error);

  async function activateTrial(formData: FormData) {
    "use server";

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const submittedCode = normalizeCode(String(formData.get("code") ?? ""));

    if (!submittedCode) {
      redirect("/join?error=Missing+event+code");
    }
    if (!user) {
      redirect(`/login?code=${encodeURIComponent(submittedCode)}`);
    }

    const { error } = await (supabase as any).rpc("redeem_event_code", { p_code: submittedCode });
    if (error) {
      redirect(`/join?code=${encodeURIComponent(submittedCode)}&error=${encodeURIComponent(error.message)}`);
    }

    redirect("/account?activated=1");
  }

  return (
    <main style={{ maxWidth: 560, margin: "2rem auto", padding: "0 1rem", display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Join with event code</h1>
      <p style={{ margin: 0, color: "#475569" }}>
        Enter your event code to activate your 7-day premium trial.
      </p>
      {error ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p> : null}

      <form action={activateTrial as any} style={{ display: "grid", gap: 10 }}>
        <input
          type="text"
          name="code"
          defaultValue={code}
          placeholder="Event code"
          required
          style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
        {user ? (
          <button
            type="submit"
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #0f172a",
              background: "#0f172a",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            Activate Trial
          </button>
        ) : null}
      </form>

      {!user ? (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 14 }}>
          <Link href={code ? `/signup?code=${encodeURIComponent(code)}` : "/signup"}>Create account</Link>
          <Link href={code ? `/login?code=${encodeURIComponent(code)}` : "/login"}>Log in</Link>
        </div>
      ) : null}
    </main>
  );
}
