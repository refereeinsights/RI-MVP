"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import styles from "./WeekendPlanner.module.css";

export default function WeekendPlannerEntryCtas() {
  const authViewedRef = useRef(false);

  useEffect(() => {
    if (authViewedRef.current) return;
    authViewedRef.current = true;
    void trackTiEvent("weekend_planner_auth_required_viewed", {
      surface: "planner",
      source_page_type: "planner",
      auth_state: "signed_out",
      entitlement: "explorer",
      action_surface: "entry_cta",
    });
  }, []);

  return (
    <>
      <Link
        className={styles.ctaFull}
        href="/signup?returnTo=%2Fweekend-planner"
        onClick={() => {
          void trackTiEvent("weekend_planner_create_account_clicked", {
            surface: "planner",
            source_page_type: "planner",
            cta_type: "create_account",
            auth_state: "signed_out",
            entitlement: "explorer",
          });
        }}
      >
        Create account to test beta
      </Link>
      <Link
        className="secondaryLink"
        href="/login?returnTo=%2Fweekend-planner"
        onClick={() => {
          void trackTiEvent("weekend_planner_sign_in_clicked", {
            surface: "planner",
            source_page_type: "planner",
            cta_type: "sign_in",
            auth_state: "signed_out",
            entitlement: "explorer",
          });
        }}
      >
        Sign in
      </Link>
    </>
  );
}
