"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ClaimResult =
  | { ok: true; granted: boolean; trial_ends_at?: string | null }
  | { ok: false; error: string };

const PENDING_KEY = "ti_qvc_weekendpro_pending_v1";

type PendingPayload = { quick_check_id: string; browser_hash?: string };

export default function QuickVenueCheckRewardClaim({
  initialPending,
  isWeekendPro,
}: {
  initialPending?: PendingPayload | null;
  isWeekendPro?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const attemptedKeyRef = useRef<string>("");

  const searchParamsString = searchParams.toString();
  const urlQuickCheckId = (searchParams.get("quick_check_id") || "").trim();
  const urlBrowserHash = (searchParams.get("browser_hash") || "").trim();
  const urlPromo = (searchParams.get("promo") || "").trim();
  const debug = (searchParams.get("debug") || "").trim() === "1";

  function toUserFacingError(raw: string) {
    const message = (raw || "").trim();
    if (!message) return "We’re still finishing your Weekend Pro upgrade. Refresh in a moment.";
    if (debug) return message;
    const lower = message.toLowerCase();
    if (lower.includes("email verification")) return "Confirm your email to unlock Weekend Pro.";
    if (lower.includes("authentication")) return "Sign in to unlock Weekend Pro.";
    if (lower.includes("browser mismatch")) return "Open your account in the same browser where you submitted the quick check.";
    return "We’re still finishing your Weekend Pro upgrade. Refresh in a moment.";
  }

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

  const attemptKey = useMemo(() => {
    if (!effectivePending?.quick_check_id) return "";
    const quickCheckId = effectivePending.quick_check_id.trim();
    const browserHash = (effectivePending.browser_hash ?? "").trim();
    return `${quickCheckId}:${browserHash}`;
  }, [effectivePending?.browser_hash, effectivePending?.quick_check_id]);

  useEffect(() => {
    if (!result?.ok) return;
    const t = window.setTimeout(() => setDismissed(true), 4000);
    return () => window.clearTimeout(t);
  }, [result]);

  useEffect(() => {
    if (!isWeekendPro) return;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(PENDING_KEY);
      } catch {
        // ignore storage failures
      }
    }

    const hasPromoParams = Boolean(urlPromo || urlQuickCheckId || urlBrowserHash);
    if (!hasPromoParams) return;

    const params = new URLSearchParams(searchParamsString);
    params.delete("promo");
    params.delete("quick_check_id");
    params.delete("browser_hash");
    const suffix = params.toString();
    router.replace(suffix ? `/account?${suffix}` : "/account");
  }, [isWeekendPro, router, searchParamsString, urlBrowserHash, urlPromo, urlQuickCheckId]);

  useEffect(() => {
    if (!effectivePending) return;
    if (!attemptKey) return;
    if (attemptedKeyRef.current === attemptKey) return;
    attemptedKeyRef.current = attemptKey;

    let alive = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    fetch("/api/venue-quick-check/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(effectivePending),
      signal: controller.signal,
    })
      .then(async (res) => {
        let text = "";
        try {
          text = await res.text();
        } catch {
          text = "";
        }
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }

        if (!res.ok || !json?.ok) {
          const message = String(
            json?.error ??
              (text ? text.slice(0, 220) : "") ??
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
        if (next.ok) {
          router.refresh();
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
      .catch((err) => {
        if (!alive) return;
        const message =
          err instanceof Error
            ? err.name === "AbortError"
              ? "Claim request timed out. Refresh the page and try again."
              : err.message
            : "Unable to claim reward";
        setResult({ ok: false, error: message });
      })
      .finally(() => {
        if (!alive) return;
        window.clearTimeout(timeout);
      });

    return () => {
      alive = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attemptKey, effectivePending, router, searchParamsString, urlPromo, urlQuickCheckId]);

  if (isWeekendPro) return null;
  if (dismissed) return null;
  if (!effectivePending) return null;
  if (!result) {
    return (
      <p style={{ margin: "0 0 14px 0", padding: "10px 12px", borderRadius: 10, background: "#f8fafc", border: "1px solid #cbd5e1", color: "#334155" }}>
        Claiming Weekend Pro reward…
      </p>
    );
  }

  if (!result.ok) {
    return (
      <div style={{ margin: "0 0 14px 0", padding: "10px 12px", borderRadius: 10, background: "#fff7ed", border: "1px solid #fdba74", color: "#7c2d12" }}>
        <div style={{ marginBottom: 8 }}>
          {toUserFacingError(result.error)}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              attemptedKeyRef.current = "";
              setResult(null);
            }}
            style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #fdba74", background: "#fff", cursor: "pointer" }}
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #fdba74", background: "transparent", cursor: "pointer" }}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (!result.granted) {
    const end = result.trial_ends_at ? new Date(result.trial_ends_at) : null;
    const endLabel = end && !Number.isNaN(end.getTime()) ? end.toLocaleDateString() : null;
    return (
      <p style={{ margin: "0 0 14px 0", padding: "10px 12px", borderRadius: 10, background: "#ecfeff", border: "1px solid #22d3ee" }}>
        Weekend Pro reward already applied{endLabel ? ` (until ${endLabel})` : ""}.
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
