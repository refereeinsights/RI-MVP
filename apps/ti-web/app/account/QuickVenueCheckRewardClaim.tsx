"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ClaimResult =
  | { ok: true; granted: boolean; trial_ends_at?: string | null }
  | { ok: false; error: string };

const PENDING_KEY = "ti_qvc_weekendpro_pending_v1";

type PendingPayload = { quick_check_id: string; browser_hash?: string };

export default function QuickVenueCheckRewardClaim({
  initialPending,
}: {
  initialPending?: PendingPayload | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [loading, setLoading] = useState(false);

  const searchParamsString = searchParams.toString();
  const urlQuickCheckId = (searchParams.get("quick_check_id") || "").trim();
  const urlBrowserHash = (searchParams.get("browser_hash") || "").trim();
  const urlPromo = (searchParams.get("promo") || "").trim();

  const pending = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      const json = JSON.parse(raw) as { quick_check_id?: unknown; browser_hash?: unknown } | null;
      const quickCheckId = typeof json?.quick_check_id === "string" ? json.quick_check_id.trim() : "";
      const browserHash = typeof json?.browser_hash === "string" ? json.browser_hash.trim() : "";
      if (!quickCheckId) return null;
      return { quick_check_id: quickCheckId, browser_hash: browserHash };
    } catch {
      return null;
    }
  }, []);

  const normalizedInitialPending = useMemo(() => {
    const quickCheckId = typeof initialPending?.quick_check_id === "string" ? initialPending.quick_check_id.trim() : "";
    const browserHash = typeof initialPending?.browser_hash === "string" ? initialPending.browser_hash.trim() : "";
    if (!quickCheckId) return null;
    return { quick_check_id: quickCheckId, browser_hash: browserHash };
  }, [initialPending?.browser_hash, initialPending?.quick_check_id]);

  const effectivePending =
    normalizedInitialPending ??
    pending ??
    (urlQuickCheckId ? { quick_check_id: urlQuickCheckId, browser_hash: urlBrowserHash } : null);

  useEffect(() => {
    if (!effectivePending) return;
    if (loading || result) return;

    let alive = true;
    setLoading(true);
    fetch("/api/venue-quick-check/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(effectivePending),
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.ok) {
          const textFallback = !json ? await res.text().catch(() => "") : "";
          const message = String(
            json?.error ??
              (textFallback ? textFallback.slice(0, 220) : "") ??
              "Unable to claim reward"
          );
          return { ok: false as const, error: message };
        }
        return { ok: true as const, granted: Boolean(json.granted), trial_ends_at: json.trial_ends_at ?? null };
      })
      .then((next) => {
        if (!alive) return;
        setResult(next);
        if (next.ok && typeof window !== "undefined") {
          window.localStorage.removeItem(PENDING_KEY);
        }
        if (next.ok && urlPromo === "qvc_weekend_pro_12mo_v1" && urlQuickCheckId) {
          const params = new URLSearchParams(searchParamsString);
          params.delete("promo");
          params.delete("quick_check_id");
          params.delete("browser_hash");
          const suffix = params.toString();
          router.replace(suffix ? `/account?${suffix}` : "/account");
        }
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [effectivePending, loading, result, router, searchParamsString, urlBrowserHash, urlPromo, urlQuickCheckId]);

  if (!effectivePending) return null;
  if (loading) return null;
  if (!result) return null;

  if (!result.ok) {
    return (
      <p style={{ margin: "0 0 14px 0", padding: "10px 12px", borderRadius: 10, background: "#fff7ed", border: "1px solid #fdba74" }}>
        Reward pending: {result.error}
      </p>
    );
  }

  if (!result.granted) {
    return (
      <p style={{ margin: "0 0 14px 0", padding: "10px 12px", borderRadius: 10, background: "#ecfeff", border: "1px solid #22d3ee" }}>
        Weekend Pro reward already applied.
      </p>
    );
  }

  const end = result.trial_ends_at ? new Date(result.trial_ends_at) : null;
  const endLabel = end && !Number.isNaN(end.getTime()) ? end.toLocaleDateString() : null;
  return (
    <p style={{ margin: "0 0 14px 0", padding: "10px 12px", borderRadius: 10, background: "#ecfdf5", border: "1px solid #34d399" }}>
      You unlocked Weekend Pro free for 12 months{endLabel ? ` (until ${endLabel})` : ""}.
    </p>
  );
}
