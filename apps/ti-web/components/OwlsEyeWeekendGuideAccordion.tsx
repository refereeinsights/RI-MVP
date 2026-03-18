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
      <span>
        {label} ({count})
      </span>
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
                    const primaryLink =
                      item.is_sponsor && item.sponsor_click_url ? item.sponsor_click_url : item.maps_url;
                    const miles =
                      typeof item.distance_meters === "number" && Number.isFinite(item.distance_meters)
                        ? `${(item.distance_meters / 1609.344).toFixed(1)} mi`
                        : "Distance unavailable";
                    const isTournamentSponsor = item.is_sponsor && Boolean(item.sponsor_click_url);
                    return (
                      <div className="premiumNearbyLink premiumNearbyLink--row" key={`${group.label}-${item.name}-${idx}`}>
                        <div
                          className="premiumNearbyLink__content"
                          style={{
                            display: "grid",
                            gap: 4,
                            alignItems: "center",
                            justifyItems: isTournamentSponsor ? "start" : undefined,
                          }}
                        >
                          <span
                            style={
                              isTournamentSponsor
                                ? {
                                    fontWeight: 800,
                                    color: "#f7d774",
                                    letterSpacing: "0.01em",
                                    textShadow: "0 1px 10px rgba(0,0,0,0.24)",
                                  }
                                : undefined
                            }
                          >
                            {item.name}
                          </span>
                          <span className="premiumNearbyLink__meta">
                            {miles}
                          </span>
                        </div>
                        {isTournamentSponsor ? (
                          <img
                            src="/svg/ti/tournament_sponsor_badge.svg"
                            alt="Tournament sponsor"
                            style={{
                              width: 54,
                              height: 54,
                              objectFit: "contain",
                              flex: "0 0 auto",
                              justifySelf: "center",
                              filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.28))",
                            }}
                          />
                        ) : null}
                        {primaryLink ? (
                          <a
                            className="secondaryLink premiumNearbyLink__cta"
                            href={primaryLink}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
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
