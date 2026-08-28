"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  confirmWeekendReadyTimezoneAction,
  recordWeekendReadyInteractionAction,
  subscribeWeekendReadyAction,
  unsubscribeWeekendReadyAction,
} from "@/app/actions";
import { householdTimezoneLabel } from "@/lib/householdTimezone";
import {
  decodeVapidPublicKey,
  parseBrowserTimezoneSuggestion,
  resolveWeekendReadyBrowserState,
  serializeBrowserPushSubscription,
  type WeekendReadyBrowserState,
} from "@/lib/notifications/weekendReadyBrowser";

const DISMISSED_KEY = "corralio-weekend-ready-soft-ask-dismissed-v1";

type PromptState = "checking" | WeekendReadyBrowserState | "subscribed" | "dismissed" | "error";

function isIosBrowser() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneDisplay() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches
    || navigatorWithStandalone.standalone === true;
}

export function WeekendReadyPrompt({
  planningTimezone,
  vapidPublicKey,
}: {
  planningTimezone: string | null;
  vapidPublicKey: string | null;
}) {
  const [state, setState] = useState<PromptState>("checking");
  const [confirmedTimezone, setConfirmedTimezone] = useState(planningTimezone);
  const [suggestedTimezone, setSuggestedTimezone] = useState<string | null>(null);
  const [permissionAttempted, setPermissionAttempted] = useState(false);
  const [working, setWorking] = useState<"timezone" | "subscribe" | "unsubscribe" | null>(null);
  const softAskRecorded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const suggestion = parseBrowserTimezoneSuggestion(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    setSuggestedTimezone(suggestion);

    if (window.localStorage.getItem(DISMISSED_KEY) === "1") {
      setState("dismissed");
      return () => { cancelled = true; };
    }

    const browserState = resolveWeekendReadyBrowserState({
      hasServiceWorker: "serviceWorker" in navigator,
      hasPushManager: "PushManager" in window,
      hasNotifications: "Notification" in window,
      permission: "Notification" in window ? Notification.permission : "unavailable",
      isIos: isIosBrowser(),
      isStandalone: isStandaloneDisplay(),
      vapidPublicKey,
    });
    if (browserState !== "available") {
      setState(browserState);
      return () => { cancelled = true; };
    }

    void navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setState(subscription ? "subscribed" : "available");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => { cancelled = true; };
  }, [vapidPublicKey]);

  useEffect(() => {
    if (
      softAskRecorded.current
      || (state !== "available" && state !== "ios_install_required")
    ) return;
    softAskRecorded.current = true;
    void recordWeekendReadyInteractionAction("soft_ask_shown");
  }, [state]);

  async function confirmTimezone() {
    if (!suggestedTimezone) return;
    setWorking("timezone");
    const result = await confirmWeekendReadyTimezoneAction(suggestedTimezone);
    if (result.status === "confirmed") {
      setConfirmedTimezone(suggestedTimezone);
      setState(isIosBrowser() && !isStandaloneDisplay() ? "ios_install_required" : "available");
    } else {
      setState("error");
    }
    setWorking(null);
  }

  async function enableNotifications() {
    if (!vapidPublicKey || !confirmedTimezone) return;
    setPermissionAttempted(true);
    setWorking("subscribe");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        await recordWeekendReadyInteractionAction(
          permission === "denied" ? "permission_denied" : "permission_dismissed",
        );
        setState("denied");
        return;
      }
      await recordWeekendReadyInteractionAction("permission_granted");
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidPublicKey(vapidPublicKey),
      });
      const serialized = serializeBrowserPushSubscription(subscription);
      if (!serialized) throw new Error("subscription unavailable");
      const result = await subscribeWeekendReadyAction(serialized);
      if (result.status !== "subscribed") {
        if (!existing) await subscription.unsubscribe();
        throw new Error("subscription persistence failed");
      }
      setState("subscribed");
    } catch {
      setState("error");
    } finally {
      setWorking(null);
    }
  }

  async function disableNotifications() {
    setWorking("unsubscribe");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setState("available");
        return;
      }
      const serialized = serializeBrowserPushSubscription(subscription);
      if (!serialized) throw new Error("subscription unavailable");
      const result = await unsubscribeWeekendReadyAction(serialized);
      if (result.status !== "unsubscribed") throw new Error("unsubscribe failed");
      await subscription.unsubscribe();
      setState("available");
    } catch {
      setState("error");
    } finally {
      setWorking(null);
    }
  }

  function dismissSoftAsk() {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setState("dismissed");
  }

  if (state === "checking" || state === "unsupported" || state === "dismissed") return null;
  if (state === "denied" && !permissionAttempted) return null;

  return (
    <aside className="weekendReadyPrompt" aria-labelledby="weekend-ready-heading">
      <p className="eyebrow">Weekend Ready</p>
      <h3 id="weekend-ready-heading">
        {state === "subscribed" ? "Weekend reminders are on" : "Stay ahead of your sports weekend"}
      </h3>
      {state === "subscribed" ? (
        <>
          <p>We’ll send one private reminder when your upcoming weekend plan is ready.</p>
          <button className="quietButton" type="button" disabled={working !== null} onClick={() => void disableNotifications()}>
            {working === "unsubscribe" ? "Turning off…" : "Turn off notifications"}
          </button>
        </>
      ) : !confirmedTimezone ? (
        <>
          <p>Confirm your family timezone before turning on the weekly reminder.</p>
          {suggestedTimezone ? (
            <button className="primaryButton" type="button" disabled={working !== null} onClick={() => void confirmTimezone()}>
              {working === "timezone" ? "Saving…" : `Use ${householdTimezoneLabel(suggestedTimezone)}`}
            </button>
          ) : <Link href="/family">Choose your timezone in Family</Link>}
        </>
      ) : state === "ios_install_required" ? (
        <>
          <p>On iPhone or iPad, add Corralio to your Home Screen, then open it there to turn on notifications.</p>
          <p className="fieldHelp">In your browser, use Share, then Add to Home Screen.</p>
        </>
      ) : state === "denied" ? (
        <p role="status">Notifications weren’t enabled. Your Corralio plan still works normally.</p>
      ) : state === "error" ? (
        <p role="status">We couldn’t update notifications right now. Please try again later.</p>
      ) : (
        <>
          <p>Get one reminder when your family’s weekend plan is ready.</p>
          <button className="primaryButton" type="button" disabled={working !== null} onClick={() => void enableNotifications()}>
            {working === "subscribe" ? "Turning on…" : "Turn on notifications"}
          </button>
        </>
      )}
      {state !== "subscribed" && state !== "denied" ? (
        <button className="textButton" type="button" onClick={dismissSoftAsk}>Not now</button>
      ) : null}
    </aside>
  );
}
