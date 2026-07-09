"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import styles from "./SoftPlannerCtaClient.module.css";

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
    <article className={styles.card}>
      <div className={styles.content}>
        <div className={styles.copyBlock}>
          <h2 className={styles.title}>Following multiple tournaments?</h2>
          <p className={styles.body}>Keep tournament weekends, travel notes, and reminders organized in Weekend Planner.</p>
        </div>
        <Link
          href="/weekend-planner"
          className={`${styles.cta} primaryLink`}
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
