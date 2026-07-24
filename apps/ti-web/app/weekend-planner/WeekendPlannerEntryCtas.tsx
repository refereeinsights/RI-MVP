"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { markPlannerSessionEventSeen, type PlannerSessionContext, wasPlannerSessionEventSeen } from "@/lib/planner/plannerSession";
import { trackTiEvent } from "@/lib/tiAnalyticsClient";
import styles from "./WeekendPlanner.module.css";

export default function WeekendPlannerEntryCtas(props: {
  plannerContext: PlannerSessionContext;
  authReturnTo: string;
}) {
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
    if (!wasPlannerSessionEventSeen(props.plannerContext.planner_session_id, "weekend_planner_auth_gate_viewed")) {
      markPlannerSessionEventSeen(props.plannerContext.planner_session_id, "weekend_planner_auth_gate_viewed");
      void trackTiEvent("weekend_planner_auth_gate_viewed", {
        planner_session_id: props.plannerContext.planner_session_id,
        surface: "planner",
        source_page_type: "planner",
        current_page_type: "auth",
        current_page_path: "/weekend-planner",
        entry_source: props.plannerContext.entry_source ?? "direct",
        entry_page_type: props.plannerContext.entry_page_type ?? "other",
        entry_path: props.plannerContext.entry_path ?? "/weekend-planner",
        entry_placement: props.plannerContext.entry_placement ?? "planner_entry_cta",
        auth_state: "signed_out",
        entitlement: "explorer",
        tournament_id: props.plannerContext.tournament_id ?? undefined,
        tournament_slug: props.plannerContext.tournament_slug ?? undefined,
        venue_id: props.plannerContext.venue_id ?? undefined,
        action_surface: "entry_cta",
      });
    }
  }, [props.plannerContext]);

  return (
    <>
      <Link
        className={styles.ctaFull}
        href={`/signup?returnTo=${encodeURIComponent(props.authReturnTo)}`}
        onClick={() => {
          void trackTiEvent("weekend_planner_create_account_clicked", {
            surface: "planner",
            source_page_type: "planner",
            cta_type: "create_account",
            auth_state: "signed_out",
            entitlement: "explorer",
          });
          void trackTiEvent("weekend_planner_auth_started", {
            planner_session_id: props.plannerContext.planner_session_id,
            surface: "planner",
            source_page_type: "planner",
            current_page_type: "auth",
            current_page_path: "/signup",
            entry_source: props.plannerContext.entry_source ?? "direct",
            entry_page_type: props.plannerContext.entry_page_type ?? "other",
            entry_path: props.plannerContext.entry_path ?? "/weekend-planner",
            entry_placement: props.plannerContext.entry_placement ?? "planner_entry_cta",
            auth_state: "signed_out",
            entitlement: "explorer",
            cta_type: "create_account",
            tournament_id: props.plannerContext.tournament_id ?? undefined,
            tournament_slug: props.plannerContext.tournament_slug ?? undefined,
            venue_id: props.plannerContext.venue_id ?? undefined,
          });
        }}
      >
        Create account to test beta
      </Link>
      <Link
        className="secondaryLink"
        href={`/login?returnTo=${encodeURIComponent(props.authReturnTo)}`}
        onClick={() => {
          void trackTiEvent("weekend_planner_sign_in_clicked", {
            surface: "planner",
            source_page_type: "planner",
            cta_type: "sign_in",
            auth_state: "signed_out",
            entitlement: "explorer",
          });
          void trackTiEvent("weekend_planner_auth_started", {
            planner_session_id: props.plannerContext.planner_session_id,
            surface: "planner",
            source_page_type: "planner",
            current_page_type: "auth",
            current_page_path: "/login",
            entry_source: props.plannerContext.entry_source ?? "direct",
            entry_page_type: props.plannerContext.entry_page_type ?? "other",
            entry_path: props.plannerContext.entry_path ?? "/weekend-planner",
            entry_placement: props.plannerContext.entry_placement ?? "planner_entry_cta",
            auth_state: "signed_out",
            entitlement: "explorer",
            cta_type: "sign_in",
            tournament_id: props.plannerContext.tournament_id ?? undefined,
            tournament_slug: props.plannerContext.tournament_slug ?? undefined,
            venue_id: props.plannerContext.venue_id ?? undefined,
          });
        }}
      >
        Sign in
      </Link>
    </>
  );
}
