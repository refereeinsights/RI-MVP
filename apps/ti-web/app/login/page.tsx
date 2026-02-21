"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    const supabase = getSupabaseBrowserClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    const user = data.user;
    if (!user?.email_confirmed_at) {
      router.replace("/verify-email");
      router.refresh();
      return;
    }

    router.replace("/account");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 480, margin: "2rem auto", padding: "0 1rem", display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Log in</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
        <button
          type="submit"
          disabled={status === "saving"}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", fontWeight: 700 }}
        >
          {status === "saving" ? "Logging in..." : "Log in"}
        </button>
      </form>
      {message ? <div style={{ fontSize: 13, color: "#b91c1c" }}>{message}</div> : null}
      <div style={{ fontSize: 13 }}>
        Need an account? <Link href="/signup">Sign up</Link>
      </div>
    </main>
  );
}
