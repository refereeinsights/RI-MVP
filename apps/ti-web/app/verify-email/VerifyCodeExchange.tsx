"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type VerifyCodeExchangeProps = {
  returnTo: string;
};

export default function VerifyCodeExchange({ returnTo }: VerifyCodeExchangeProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const code = searchParams.get("code")?.trim();
    if (!code) return;

    const run = async () => {
      setStatus("working");
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setStatus("error");
        setMessage(error.message || "Verification link is invalid or expired. Please request a new one.");
        return;
      }
      try {
        await fetch("/api/account/profile", { method: "POST" });
      } catch {
        // Account page still performs profile sync on load.
      }
      router.replace(returnTo);
      router.refresh();
    };

    void run();
  }, [router, returnTo, searchParams]);

  if (status === "working") {
    return <p style={{ margin: 0, color: "#334155" }}>Verifying your email...</p>;
  }

  if (status === "error") {
    return <p style={{ margin: 0, color: "#b91c1c" }}>{message}</p>;
  }

  return null;
}
