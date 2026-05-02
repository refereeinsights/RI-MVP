"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import UpgradeWeekendProButton from "@/components/UpgradeWeekendProButton";
import { sendTiAnalytics } from "@/lib/analytics";
import { WEEKEND_PRO_FOUNDING_DISCLAIMER, WEEKEND_PRO_FOUNDING_PRICE_LINE } from "@/lib/weekendProPricing";

type WeekendProUpgradeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source_page?: string;
  source_context?: string;
  tournament_slug?: string | null;
  venue_slug?: string | null;
  entry_point?: string;
  cta_label?: string;
  user_tier?: "explorer" | "insider" | "weekend_pro" | "unknown";
  has_affiliate_visible?: boolean;
};

export default function WeekendProUpgradeModal(props: WeekendProUpgradeModalProps) {
  const viewedForOpenRef = useRef(false);
  const [imageOk, setImageOk] = useState(true);

  const ctaLabel = (props.cta_label || "Upgrade to Weekend Pro").trim();
  const hasAffiliateVisible = Boolean(props.has_affiliate_visible);

  const analyticsBody = useMemo(
    () => ({
      source: props.source_page || null,
      source_context: props.source_context || null,
      tournament_slug: props.tournament_slug || null,
      venue_slug: props.venue_slug || null,
      entry_point: props.entry_point || null,
      cta_label: ctaLabel,
      user_tier: props.user_tier || null,
      has_affiliate_visible: hasAffiliateVisible,
    }),
    [
      props.source_page,
      props.source_context,
      props.tournament_slug,
      props.venue_slug,
      props.entry_point,
      ctaLabel,
      props.user_tier,
      hasAffiliateVisible,
    ]
  );

  useEffect(() => {
    if (!props.open) {
      viewedForOpenRef.current = false;
      return;
    }
    if (viewedForOpenRef.current) return;
    viewedForOpenRef.current = true;
    try {
      void sendTiAnalytics("premium_modal_viewed", analyticsBody);
    } catch {
      // ignore
    }
  }, [props.open, analyticsBody]);

  if (!props.open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade to Weekend Pro"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "grid",
        placeItems: "center",
        padding: 14,
        background: "rgba(0,0,0,0.55)",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onOpenChange(false);
      }}
    >
      <div
        style={{
          width: "min(640px, 100%)",
          maxHeight: "min(86vh, 720px)",
          overflow: "auto",
          background: "#0b1f14",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          color: "white",
          boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
        }}
      >
        {imageOk ? (
          <img
            src="/brand/weekend-pro-launch.png"
            alt="Weekend Pro"
            style={{
              width: "100%",
              height: "auto",
              maxHeight: 260,
              objectFit: "contain",
              objectPosition: "center",
              display: "block",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              background: "#07180f",
            }}
            onError={() => setImageOk(false)}
          />
        ) : null}

        <div style={{ padding: 16, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 950, lineHeight: 1.15 }}>
                Stay close to where games are played
              </div>
              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9, lineHeight: 1.35 }}>
                You’re viewing limited results for this venue. Weekend Pro shows nearby hotels, rentals, coffee, and
                food around the fields so you can plan your weekend faster.
              </div>
            </div>
            <button
              type="button"
              onClick={() => props.onOpenChange(false)}
              style={{
                background: "transparent",
                color: "white",
                border: "1px solid rgba(255,255,255,0.22)",
                borderRadius: 10,
                padding: "6px 10px",
                fontWeight: 900,
                cursor: "pointer",
                height: 34,
              }}
            >
              Close
            </button>
          </div>

          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 13, opacity: 0.95 }}>
            <li>See hotels and rentals near the fields</li>
            <li>Avoid long drives between games</li>
            <li>Find coffee, food, and local spots fast</li>
          </ul>

          <div style={{ marginTop: 4, display: "grid", gap: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 950 }}>{WEEKEND_PRO_FOUNDING_PRICE_LINE}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{WEEKEND_PRO_FOUNDING_DISCLAIMER}</div>
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
            <UpgradeWeekendProButton
              className=""
              buttonStyle={{
                width: "100%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "12px 14px",
                borderRadius: 12,
                minHeight: 44,
                fontSize: 15,
                fontWeight: 900,
                cursor: "pointer",
                background: "#16a34a",
                color: "#ffffff",
                border: "1px solid rgba(0,0,0,0.12)",
                boxShadow: "0 10px 20px rgba(0,0,0,0.18)",
              }}
              source_page={props.source_page}
              source_context={props.source_context}
              tournament_slug={props.tournament_slug ?? null}
              venue_slug={props.venue_slug ?? null}
              entry_point={props.entry_point}
              cta_label={ctaLabel}
              label={ctaLabel}
              user_tier={props.user_tier}
              has_affiliate_visible={hasAffiliateVisible}
            />
            <button
              type="button"
              onClick={() => props.onOpenChange(false)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "transparent",
                color: "white",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Continue with limited results
            </button>
            <div style={{ fontSize: 12, opacity: 0.85, textAlign: "center", fontWeight: 800 }}>
              Secure checkout powered by Stripe
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
