"use client";

import { useMemo, useState } from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import { buildWeekendShareUrl, type WeekendShareSourcePage } from "@/lib/weekendShare";

type ShareChannel = "copy" | "native" | "sms" | "email" | "unknown";

export default function ShareWeekendButton(props: {
  tournamentSlug: string;
  tournamentName: string;
  venueLabel?: string | null; // for message copy only
  venue?: string | null; // slug preferred; uuid allowed
  sourcePage: WeekendShareSourcePage;
  buttonLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const shareUrl = useMemo(
    () =>
      buildWeekendShareUrl({
        tournamentSlug: props.tournamentSlug,
        venue: props.venue ?? null,
        sourcePage: props.sourcePage,
      }),
    [props.tournamentSlug, props.venue, props.sourcePage]
  );

  const message = useMemo(() => {
    if (props.venueLabel) {
      return `We’re playing at ${props.venueLabel} for ${props.tournamentName}. Here’s the weekend plan: ${shareUrl}`;
    }
    return `We’re playing here this weekend — tournament details, venues, hotels, rentals, and food options are all in one place: ${shareUrl}`;
  }, [props.venueLabel, props.tournamentName, shareUrl]);

  const log = (channel: ShareChannel) => {
    const slug = String(props.tournamentSlug || "").trim();
    if (!slug) return;
    trackTiEvent("weekend_share_clicked", {
      source_page: props.sourcePage,
      channel,
      tournament_slug: slug,
      venue: props.venue ?? null,
      share_url: shareUrl,
    });
  };

  const onCopy = async () => {
    log("copy");
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = shareUrl;
        el.style.position = "fixed";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      } catch {
        // ignore
      }
    }
  };

  const onNativeShare = async () => {
    log("native");
    try {
      if (navigator.share) {
        await navigator.share({ title: `${props.tournamentName} weekend plan`, text: message, url: shareUrl });
        return;
      }
    } catch {
      // ignore
    }
    // Fallback: copy link.
    await onCopy();
  };

  const smsHref = useMemo(() => {
    const body = encodeURIComponent(message);
    return `sms:&body=${body}`;
  }, [message]);

  const emailHref = useMemo(() => {
    const subject = encodeURIComponent(`${props.tournamentName} weekend plan`);
    const body = encodeURIComponent(message);
    return `mailto:?subject=${subject}&body=${body}`;
  }, [props.tournamentName, message]);

  return (
    <>
      <button type="button" className={props.className} onClick={() => setOpen(true)}>
        {props.buttonLabel ?? "Share This Weekend"}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Share this tournament weekend"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgba(0,0,0,0.45)",
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            style={{
              width: "min(560px, 100%)",
              background: "#0b1f14",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 16,
              padding: 16,
              color: "white",
              boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Share this tournament weekend</div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                  Send one link with the tournament, venue, hotels, rentals, and nearby food.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.22)",
                  borderRadius: 10,
                  padding: "6px 10px",
                  fontWeight: 800,
                }}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.9 }}>Share link</div>
              <div
                style={{
                  fontSize: 12,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  wordBreak: "break-all",
                }}
              >
                {shareUrl}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={onCopy}
                  style={{
                    background: "#10b981",
                    color: "#062016",
                    border: 0,
                    borderRadius: 12,
                    padding: "10px 12px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Copy link
                </button>
                <button
                  type="button"
                  onClick={onNativeShare}
                  style={{
                    background: "transparent",
                    color: "white",
                    border: "1px solid rgba(255,255,255,0.22)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Share…
                </button>
                <a
                  href={smsHref}
                  onClick={() => log("sms")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    textDecoration: "none",
                    background: "transparent",
                    color: "white",
                    border: "1px solid rgba(255,255,255,0.22)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    fontWeight: 900,
                  }}
                >
                  Text/SMS
                </a>
                <a
                  href={emailHref}
                  onClick={() => log("email")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    textDecoration: "none",
                    background: "transparent",
                    color: "white",
                    border: "1px solid rgba(255,255,255,0.22)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    fontWeight: 900,
                  }}
                >
                  Email
                </a>
              </div>

              <div style={{ fontSize: 12, opacity: 0.85 }}>
                Tip: This link opens a TI weekend page. Hotel and Vrbo searches run through TI buttons after opening.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

