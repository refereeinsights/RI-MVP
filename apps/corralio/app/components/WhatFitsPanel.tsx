"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { recordWhatFitsAnalyticsAction } from "@/app/actions";
import type { WhatFitsServerResult } from "@/lib/whatFits.server";
import type { WhatFitsMode } from "@/lib/whatFits";

type ReadyResult = Extract<WhatFitsServerResult, { kind: "ready" }>;

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  if (!remainder) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function arrivalLabel(result: ReadyResult) {
  if (result.arrivalSource === "ics_explicit") return "Arrival time from schedule";
  if (result.arrivalSource === "team_preference") return `Based on your team’s ${result.arrivalMinutes}-minute arrival setting`;
  return "Estimated · 30 min before start";
}

export function WhatFitsPanel({
  food,
  coffee,
  coffeeLoading,
  onLoadCoffee,
  onNavigate,
}: {
  food: ReadyResult;
  coffee: WhatFitsServerResult | null;
  coffeeLoading: boolean;
  onLoadCoffee: () => void;
  onNavigate: (location: string) => void;
}) {
  const [mode, setMode] = useState<WhatFitsMode>("food");
  const [expanded, setExpanded] = useState(false);
  const surfacedRef = useRef(false);
  const shownRef = useRef(new Set<string>());
  const coffeeReady = coffee?.kind === "ready" ? coffee : null;
  const result = mode === "food" ? food : coffeeReady;
  const recommendations = useMemo(() => result?.recommendations ?? [], [result]);
  const visible = useMemo(() => recommendations.slice(0, expanded ? 10 : 3), [expanded, recommendations]);
  const bothModesHaveNoFit = food.recommendations.length === 0
    && coffeeReady?.recommendations.length === 0;

  useEffect(() => {
    if (surfacedRef.current) return;
    surfacedRef.current = true;
    void recordWhatFitsAnalyticsAction({
      event: "eligible_gap_identified",
      mode: "food",
      arrivalSource: food.arrivalSource,
      resultCount: food.recommendations.length,
    });
    void recordWhatFitsAnalyticsAction({
      event: "what_fits_surfaced",
      mode: "food",
      arrivalSource: food.arrivalSource,
      resultCount: food.recommendations.length,
    });
    void recordWhatFitsAnalyticsAction({
      event: "what_fits_viewed",
      mode: "food",
      arrivalSource: food.arrivalSource,
      resultCount: food.recommendations.length,
    });
  }, [food]);

  useEffect(() => {
    if (mode === "coffee" && coffee?.kind === "suppressed" && !coffeeLoading) setMode("food");
  }, [coffee, coffeeLoading, mode]);

  useEffect(() => {
    if (!result) return;
    for (const [index, recommendation] of visible.entries()) {
      const key = `${mode}:${recommendation.id}`;
      if (shownRef.current.has(key)) continue;
      shownRef.current.add(key);
      void recordWhatFitsAnalyticsAction({
        event: "candidate_shown",
        mode,
        arrivalSource: result.arrivalSource,
        resultCount: result.recommendations.length,
        candidatePosition: index + 1,
      });
    }
    if (!recommendations.length) {
      const key = `${mode}:no-fit`;
      if (!shownRef.current.has(key)) {
        shownRef.current.add(key);
        void recordWhatFitsAnalyticsAction({
          event: "no_fit",
          mode,
          reason: "no_candidate_fit",
          arrivalSource: result.arrivalSource,
          resultCount: 0,
        });
      }
    }
  }, [mode, recommendations.length, result, visible]);

  function chooseMode(nextMode: WhatFitsMode) {
    setMode(nextMode);
    setExpanded(false);
    void recordWhatFitsAnalyticsAction({ event: "mode_selected", mode: nextMode, arrivalSource: food.arrivalSource });
    if (nextMode === "coffee" && !coffee) onLoadCoffee();
  }

  return (
    <li className="whatFitsWrap">
      <section className="whatFitsPanel" aria-labelledby={`what-fits-${food.currentEventId}`}>
        <div className="whatFitsHero">
          <div>
            <p className="eyebrow">What fits?</p>
            <h3 id={`what-fits-${food.currentEventId}`}>{formatDuration(food.rawGapMinutes)} between events</h3>
          </div>
          <div className="whatFitsArrival">
            <strong>Arrive by {formatTime(food.requiredArrivalAt)}</strong>
            <span>{arrivalLabel(food)}</span>
          </div>
        </div>
        <div className="whatFitsModes" role="group" aria-label="Recommendation type">
          <button type="button" className={mode === "food" ? "active" : ""} aria-pressed={mode === "food"} onClick={() => chooseMode("food")}>Food</button>
          <button type="button" className={mode === "coffee" ? "active" : ""} aria-pressed={mode === "coffee"} onClick={() => chooseMode("coffee")}>Coffee</button>
        </div>
        {mode === "coffee" && coffeeLoading ? <p className="whatFitsLoading" role="status">Checking Coffee options…</p> : null}
        {result && !recommendations.length ? (
          <p className="whatFitsNoResult">
            {bothModesHaveNoFit
              ? "Nothing nearby comfortably fits this window."
              : `No ${mode === "food" ? "Food" : "Coffee"} options comfortably fit this window.`}
          </p>
        ) : null}
        {visible.length ? (
          <ol className="whatFitsResults">
            {visible.map((recommendation, index) => {
              const descriptor = mode === "coffee"
                ? "Coffee"
                : recommendation.foodTags[0] ? `Food · ${titleCase(recommendation.foodTags[0])}` : "Food";
              return (
                <li className="whatFitsCandidate" key={recommendation.id}>
                  <div className="whatFitsCandidateHeading">
                    <div><h4>{recommendation.name}</h4><p>{descriptor}</p></div>
                    <span>✓ Fits your schedule</span>
                  </div>
                  <p className="whatFitsRoute">{recommendation.outboundMinutes} min from here · {recommendation.inboundMinutes} min to next event</p>
                  <div className="whatFitsActionRow">
                    <div>
                      <strong>Leave by {formatTime(recommendation.leaveCandidateAt)}</strong>
                      <span>Estimated drive times · No live traffic</span>
                      {recommendation.operatingStatus === "status_unknown" ? <span>Hours not verified</span> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void recordWhatFitsAnalyticsAction({ event: "candidate_selected", mode, arrivalSource: result?.arrivalSource ?? food.arrivalSource, resultCount: recommendations.length, candidatePosition: index + 1 });
                        void recordWhatFitsAnalyticsAction({ event: "directions_started", mode, arrivalSource: result?.arrivalSource ?? food.arrivalSource, resultCount: recommendations.length, candidatePosition: index + 1 });
                        onNavigate(recommendation.navigationQuery);
                      }}
                    >Directions</button>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
        {!expanded && recommendations.length > 3 ? (
          <button
            className="whatFitsSeeMore"
            type="button"
            onClick={() => {
              setExpanded(true);
              void recordWhatFitsAnalyticsAction({ event: "see_more_opened", mode, arrivalSource: result?.arrivalSource ?? food.arrivalSource, resultCount: recommendations.length });
            }}
          >See {recommendations.length - 3} more that fit</button>
        ) : null}
      </section>
    </li>
  );
}
