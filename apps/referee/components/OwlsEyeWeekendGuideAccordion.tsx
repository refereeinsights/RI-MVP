"use client";

import { useId, useState } from "react";
import type { NearbyPlace } from "@/components/venues/OwlsEyeVenueCard";

type Group = {
  label: "Coffee" | "Food" | "Hotels" | "Gear";
  items: NearbyPlace[];
};

type Props = {
  groups: Group[];
  defaultAllCollapsed?: boolean;
};

function HeaderButton({
  label,
  count,
  expanded,
  onClick,
  controlsId,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onClick: () => void;
  controlsId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controlsId}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        background: "transparent",
        color: "inherit",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 10,
        padding: "8px 10px",
        cursor: "pointer",
        fontWeight: 700,
      }}
    >
      <span>{label} ({count})</span>
      <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
    </button>
  );
}

export default function OwlsEyeWeekendGuideAccordion({ groups, defaultAllCollapsed = false }: Props) {
  const baseId = useId();
  const [open, setOpen] = useState<Record<Group["label"], boolean>>({
    Coffee: !defaultAllCollapsed,
    Food: false,
    Hotels: false,
    Gear: false,
  });

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {groups.map((group) => {
        const controlsId = `${baseId}-${group.label.toLowerCase()}`;
        const expanded = Boolean(open[group.label]);
        return (
          <section className="premiumNearbyGroup" key={`${group.label}-${controlsId}`}>
            <HeaderButton
              label={group.label}
              count={group.items.length}
              expanded={expanded}
              controlsId={controlsId}
              onClick={() => setOpen((prev) => ({ ...prev, [group.label]: !prev[group.label] }))}
            />
            {expanded ? (
              <div className="premiumNearbyGroup__list" id={controlsId}>
                {group.items.length ? (
                  group.items.map((item, idx) => {
                    const primaryLink = item.is_sponsor && item.sponsor_click_url ? item.sponsor_click_url : item.maps_url;
                    const miles =
                      typeof item.distance_meters === "number" && Number.isFinite(item.distance_meters)
                        ? `${(item.distance_meters / 1609.344).toFixed(1)} mi`
                        : "Distance unavailable";
                    return (
                      <div className="premiumNearbyLink premiumNearbyLink--row" key={`${group.label}-${item.name}-${idx}`}>
                        <div className="premiumNearbyLink__content">
                          <span>{item.name}</span>
                          <span className="premiumNearbyLink__meta">
                            {miles}
                            {item.is_sponsor && item.sponsor_click_url ? " • Sponsored" : ""}
                          </span>
                        </div>
                        {primaryLink ? (
                          <a className="secondaryLink premiumNearbyLink__cta" href={primaryLink} target="_blank" rel="noopener noreferrer">
                            Directions
                          </a>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="premiumNearbyLink premiumNearbyLink--row">
                    <div className="premiumNearbyLink__content">
                      <span>No results yet.</span>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
