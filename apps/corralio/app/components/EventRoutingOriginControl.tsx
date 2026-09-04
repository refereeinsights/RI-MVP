"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  clearAlternateEventOriginAction,
  routeCurrentLocationAction,
  saveAlternateEventOriginAction,
} from "@/app/actions";
import type { TemporaryOriginKind, TemporaryOriginRouteResult } from "@/lib/temporaryOrigin";

function originLabel(kind: TemporaryOriginKind, address: string | null) {
  if (kind === "current_location") return "current location";
  if (kind === "alternate_address") return address || "another location";
  return "Home";
}

export function EventRoutingOriginControl({
  eventId,
  originKind,
  originAddress,
  persistedAlternate,
  onRoute,
  onUseHome,
}: {
  eventId: string;
  originKind: TemporaryOriginKind;
  originAddress: string | null;
  persistedAlternate: boolean;
  onRoute: (result: Extract<TemporaryOriginRouteResult, { status: "success" }>, address?: string) => void;
  onUseHome: () => void;
}) {
  const router = useRouter();
  const [address, setAddress] = useState(originKind === "alternate_address" ? originAddress ?? "" : "");
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");

  async function useHome() {
    if (state === "working") return;
    setState("working");
    setMessage("");
    if (persistedAlternate) {
      const result = await clearAlternateEventOriginAction(eventId);
      if (result.status !== "cleared") {
        setState("error");
        setMessage("We couldn’t restore Home right now.");
        return;
      }
      router.refresh();
    }
    onUseHome();
    setState("idle");
  }

  function useCurrentLocation() {
    if (state === "working") return;
    if (!navigator.geolocation) {
      setState("error");
      setMessage("Current location isn’t available in this browser.");
      return;
    }
    setState("working");
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void routeCurrentLocationAction({
          eventId,
          coordinates: { lat: position.coords.latitude, lng: position.coords.longitude },
        }).then((result) => {
          if (result.status === "success") {
            onRoute(result);
            setState("idle");
            return;
          }
          setState("error");
          setMessage(result.status === "busy"
            ? "That estimate is already being calculated."
            : "We couldn’t calculate from your current location.");
        });
      },
      () => {
        setState("error");
        setMessage("Current location wasn’t shared. Choose another location or keep Home.");
      },
      { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 },
    );
  }

  async function useAlternateLocation() {
    if (state === "working") return;
    setState("working");
    setMessage("");
    const result = await saveAlternateEventOriginAction({ eventId, address });
    if (result.status === "success") {
      onRoute(result, address.trim());
      setState("idle");
      return;
    }
    setState("error");
    setMessage(result.status === "invalid"
      ? "Enter a valid address no longer than 100 characters."
      : result.status === "busy"
        ? "That location is already being calculated."
        : "We couldn’t calculate from that location.");
  }

  return (
    <details className="eventOriginControl">
      <summary>Leaving from {originLabel(originKind, originAddress)} <span>· Change</span></summary>
      <div className="eventOriginChoices">
        <button type="button" disabled={state === "working" || originKind === "home"} onClick={useHome}>
          Use Home
        </button>
        <div className="eventCurrentLocation">
          <p>Your current location is used once, sent to our routing provider to estimate the drive, and not retained by Corralio.</p>
          <button type="button" disabled={state === "working"} onClick={useCurrentLocation}>Use current location</button>
        </div>
        <label>
          Another starting address
          <input
            type="text"
            value={address}
            maxLength={100}
            autoComplete="street-address"
            onChange={(event) => setAddress(event.target.value)}
          />
        </label>
        <button type="button" disabled={state === "working" || !address.trim()} onClick={useAlternateLocation}>
          Use this address
        </button>
        {state === "working" ? <p role="status">Calculating…</p> : null}
        {state === "error" && message ? <p className="formMessage error" role="alert">{message}</p> : null}
      </div>
    </details>
  );
}
