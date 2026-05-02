"use client";

import { useMemo, useState } from "react";
import { sendTiAnalytics } from "@/lib/analytics";

type UpgradeWeekendProButtonProps = {
  className?: string;
  buttonStyle?: React.CSSProperties;
  label?: string;
  source_page?: string;
  source_context?: string;
  tournament_slug?: string | null;
  venue_slug?: string | null;
  entry_point?: string;
  cta_label?: string;
  user_tier?: "explorer" | "insider" | "weekend_pro" | "unknown";
  has_affiliate_visible?: boolean;
};

function buildReturnTo() {
  if (typeof window === "undefined") return "/account";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function buildUpgradeLoginReturnTo() {
  const from = buildReturnTo();
  const qp = new URLSearchParams();
  qp.set("autocheckout", "1");
  qp.set("from", from);
  return `/premium?${qp.toString()}`;
}

export default function UpgradeWeekendProButton(props: UpgradeWeekendProButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = (props.label || "Upgrade to Weekend Pro").trim();
  const hasAffiliateVisible = Boolean(props.has_affiliate_visible);

  const body = useMemo(
    () => ({
      source: props.source_page || null,
      source_context: props.source_context || null,
      tournament_slug: props.tournament_slug || null,
      venue_slug: props.venue_slug || null,
      entry_point: props.entry_point || null,
      cta_label: props.cta_label || label,
      user_tier: props.user_tier || null,
      has_affiliate_visible: hasAffiliateVisible,
    }),
    [
      props.source_page,
      props.source_context,
      props.tournament_slug,
      props.venue_slug,
      props.entry_point,
      props.cta_label,
      props.user_tier,
      label,
      hasAffiliateVisible,
    ]
  );

  async function onClick() {
    setLoading(true);
    setError(null);

    try {
      void sendTiAnalytics("premium_cta_clicked", body);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        // Guest checkout: let Stripe collect email/payment first, then prompt to create/login
        // to claim the subscription in TI.
        const guestRes = await fetch("/api/stripe/checkout-guest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const guestText = await guestRes.text();
        const guestJson = guestText ? (JSON.parse(guestText) as any) : null;
        if (!guestRes.ok || !guestJson?.ok || !guestJson?.url) {
          throw new Error(guestJson?.error || guestJson?.message || `checkout_failed_${guestRes.status}`);
        }
        window.location.href = String(guestJson.url);
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
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className={props.className}
        style={props.buttonStyle}
      >
        {loading ? "Opening checkout..." : label}
      </button>
      {error ? <div style={{ fontSize: 13, color: "#b91c1c", fontWeight: 700 }}>{error}</div> : null}
    </div>
  );
}
