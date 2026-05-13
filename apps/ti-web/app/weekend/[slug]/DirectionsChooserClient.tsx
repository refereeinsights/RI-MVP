"use client";

import { useMemo, useState } from "react";
import NavigationChooser, { type NavProvider } from "@/app/tournaments/[slug]/map/NavigationChooser";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import type { TiAnalyticsEventName } from "@/lib/tiAnalyticsEvents";

type ProviderHrefs = Partial<Record<NavProvider, string>>;

function buildProviderHrefsFromQuery(query: string): ProviderHrefs {
  const q = String(query ?? "").trim();
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`,
    apple: `https://maps.apple.com/?daddr=${encodeURIComponent(q)}`,
    waze: `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`,
  };
}

function buildProviderHrefsFromLatLng(lat: number, lng: number): ProviderHrefs {
  const dest = `${lat},${lng}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`,
    apple: `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}`,
    waze: `https://waze.com/ul?ll=${encodeURIComponent(dest)}&navigate=yes`,
  };
}

export default function DirectionsChooserClient(props: {
  label: string;
  className?: string;
  title: string;
  destinationLabel: string;
  query: string;
  coordinates: { lat: number; lng: number } | null;
  copyText?: string | null;
  analytics?: {
    event: TiAnalyticsEventName;
    properties: Record<string, unknown>;
  };
}) {
  const [open, setOpen] = useState(false);

  const providerHrefs = useMemo(() => {
    const coords = props.coordinates;
    if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
      return buildProviderHrefsFromLatLng(coords.lat, coords.lng);
    }
    return buildProviderHrefsFromQuery(props.query);
  }, [props.coordinates, props.query]);

  const copyText = String(props.copyText ?? "").trim() || null;

  return (
    <>
      <button
        type="button"
        className={props.className}
        onClick={() => {
          setOpen(true);
        }}
      >
        {props.label}
      </button>

      <NavigationChooser
        open={open}
        title={props.title}
        destinationLabel={props.destinationLabel}
        providerHrefs={providerHrefs}
        copyText={copyText}
        onClose={() => setOpen(false)}
        onProviderClick={(provider) => {
          if (!props.analytics) return;
          const href = provider === "copy" ? null : providerHrefs[provider] ?? null;
          void trackTiEvent(props.analytics.event as any, {
            ...(props.analytics.properties ?? {}),
            provider,
            href,
            has_coordinates: Boolean(props.coordinates),
          } as any);
        }}
      />
    </>
  );
}
