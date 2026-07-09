"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";

export default function SoftPlannerCtaClient() {
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    void trackTiEvent("weekend_planner_contextual_cta_viewed", {
      surface: "tournament_directory",
      source_page_type: "tournament",
      cta_type: "open_planner_beta",
      context_type: "generic",
    });
  }, []);

  return (
    <article className="card card-grass" style={{ marginBottom: "1rem" }}>
      <div className="cardHeader">
        <div>
          <div className="cardTitle" style={{ fontSize: 18 }}>
            Following multiple tournaments?
          </div>
          <div className="cardMeta">Use Weekend Planner to keep tournament weekends, travel notes, and reminders in one place.</div>
        </div>
      </div>
      <div className="cardFooter" style={{ padding: "0 1.15rem 1.15rem" }}>
        <Link
          href="/weekend-planner"
          className="primaryLink"
          onClick={() => {
            void trackTiEvent("weekend_planner_contextual_cta_clicked", {
              surface: "tournament_directory",
              source_page_type: "tournament",
              cta_type: "open_planner_beta",
              context_type: "generic",
            });
          }}
        >
          Open Weekend Planner Beta
        </Link>
      </div>
    </article>
  );
}
