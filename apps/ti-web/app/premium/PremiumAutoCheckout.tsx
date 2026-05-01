"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { sendTiAnalytics } from "@/lib/analytics";

type PremiumAutoCheckoutProps = {
  enabled?: boolean;
};

export default function PremiumAutoCheckout({ enabled = false }: PremiumAutoCheckoutProps) {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const ranRef = useRef(false);

  const from = (searchParams?.get("from") ?? "").trim() || "/premium";

  useEffect(() => {
    if (!enabled) return;
    if (ranRef.current) return;
    ranRef.current = true;

    const run = async () => {
      setWorking(true);
      setError(null);

      try {
        void sendTiAnalytics("premium_cta_clicked", {
          source: "premium",
          source_context: "autocheckout",
          entry_point: "premium_autocheckout",
          cta_label: "Upgrade to Weekend Pro",
          has_affiliate_visible: false,
        });

        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source: "premium",
            source_context: "autocheckout",
            entry_point: "premium_autocheckout",
          }),
        });

        if (res.status === 401) {
          setError("Please log in again to continue checkout.");
          return;
        }

        const text = await res.text();
        const json = text ? (JSON.parse(text) as any) : null;
        if (!res.ok || !json?.ok || !json?.url) {
          throw new Error(json?.error || json?.message || `checkout_failed_${res.status}`);
        }

        window.location.href = String(json.url);
      } catch (e: any) {
        setError(e?.message || "Unable to start checkout right now.");
      } finally {
        setWorking(false);
      }
    };

    void run();
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      style={{
        margin: "10px auto 0",
        maxWidth: 720,
        padding: "12px 14px",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(15, 23, 42, 0.16)",
        color: "#e2e8f0",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 900, letterSpacing: "-0.01em" }}>
        {working ? "Opening checkout…" : "Continuing to checkout…"}
      </div>
      <div style={{ fontSize: 13, opacity: 0.92 }}>
        If checkout doesn’t open, you can continue browsing and try again.
      </div>
      {error ? (
        <div style={{ fontSize: 13, color: "#fecaca", fontWeight: 800 }}>
          {error}{" "}
          <Link href={from} style={{ color: "#bbf7d0", textDecoration: "underline" }}>
            Return
          </Link>
        </div>
      ) : null}
    </div>
  );
}

