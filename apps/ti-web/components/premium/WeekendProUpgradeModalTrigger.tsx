"use client";

import { useMemo, useRef, useState } from "react";
import WeekendProUpgradeModal from "@/components/premium/WeekendProUpgradeModal";

type Props = {
  className?: string;
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

export default function WeekendProUpgradeModalTrigger(props: Props) {
  const [open, setOpen] = useState(false);
  const openedByClickRef = useRef(false);

  const label = (props.label || "Upgrade to Weekend Pro").trim();
  const ctaLabel = (props.cta_label || label).trim();

  const modalProps = useMemo(
    () => ({
      source_page: props.source_page,
      source_context: props.source_context,
      tournament_slug: props.tournament_slug ?? null,
      venue_slug: props.venue_slug ?? null,
      entry_point: props.entry_point,
      cta_label: ctaLabel,
      user_tier: props.user_tier,
      has_affiliate_visible: props.has_affiliate_visible,
    }),
    [
      props.source_page,
      props.source_context,
      props.tournament_slug,
      props.venue_slug,
      props.entry_point,
      ctaLabel,
      props.user_tier,
      props.has_affiliate_visible,
    ]
  );

  return (
    <>
      <button
        type="button"
        className={props.className}
        onClick={() => {
          openedByClickRef.current = true;
          setOpen(true);
        }}
      >
        {label}
      </button>
      <WeekendProUpgradeModal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) openedByClickRef.current = false;
        }}
        {...modalProps}
      />
    </>
  );
}

