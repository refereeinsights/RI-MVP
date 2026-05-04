"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback } from "react";

import { sendTiAnalytics } from "@/lib/analytics";

type Props = {
  href: string;
  label: string;
  sourceContext: string;
  tournamentSlug?: string | null;
  sport?: string | null;
  variant?: "button" | "link";
};

export default function TournamentMapCta({
  href,
  label,
  sourceContext,
  tournamentSlug,
  sport,
  variant = "button",
}: Props) {
  const pathname = usePathname();

  const onClick = useCallback(() => {
    void sendTiAnalytics("tournament_map_cta_clicked", {
      source_context: sourceContext,
      tournament_slug: tournamentSlug ?? undefined,
      sport: sport ?? undefined,
      cta_label: label,
      href,
      from_path: pathname ?? undefined,
      ts: Date.now(),
    });
  }, [href, label, pathname, sourceContext, sport, tournamentSlug]);

  if (variant === "link") {
    return (
      <Link className="secondaryLink" href={href} onClick={onClick}>
        {label}
      </Link>
    );
  }

  return (
    <Link
      className="cta"
      href={href}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textDecoration: "none",
        padding: "10px 14px",
        borderRadius: 12,
        fontWeight: 950,
        background: "#16a34a",
        color: "#fff",
        border: "1px solid rgba(0,0,0,0.12)",
      }}
    >
      {label}
    </Link>
  );
}

