"use client";

import { useMemo, useState } from "react";
import { sendTiAnalytics } from "@/lib/analytics";

type UpgradeWeekendPassButtonProps = {
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

function safeMeta(value: unknown, maxLen = 200) {
  const str = String(value ?? "").trim();
  if (!str) return null;
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

export default function UpgradeWeekendPassButton(props: UpgradeWeekendPassButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = (props.label || "Unlock premium access").trim();
  const hasAffiliateVisible = Boolean(props.has_affiliate_visible);

  const body = useMemo(
    () => ({
      offer: "weekend_pass_30d",
      source: props.source_page || null,
      source_context: props.source_context || null,
      tournament_slug: props.tournament_slug || null,
      venue_slug: props.venue_slug || null,
      entry_point: props.entry_point || null,
      cta_label: props.cta_label || label,
      user_tier: props.user_tier || null,
      has_affiliate_visible: hasAffiliateVisible,
      pricing_option: "weekend_pass_30d" as const,
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
      // Distinct analytics not required; reuse the existing CTA event surface with a unique label.
      void sendTiAnalytics("premium_cta_clicked", body as any);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        // Guest checkout fallback (auth-aware routing).
        const guestRes = await fetch("/api/stripe/checkout-guest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...body,
          }),
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
      <button type="button" onClick={onClick} disabled={loading} className={props.className} style={props.buttonStyle}>
        {loading ? "Opening checkout..." : label}
      </button>
      {error ? <div style={{ fontSize: 13, color: "#b91c1c", fontWeight: 700 }}>{error}</div> : null}
    </div>
  );
}
