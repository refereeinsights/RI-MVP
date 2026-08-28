"use client";

import { useRef } from "react";

import type { SchedulePlatform } from "@/lib/schedules/platforms";

export function SchedulePlatformHelp({
  platform,
  onInstructionsViewed,
}: {
  platform: SchedulePlatform;
  onInstructionsViewed?: () => void;
}) {
  const viewed = useRef(false);

  return (
    <details
      className="schedulePlatformHelp"
      onToggle={(event) => {
        if (!event.currentTarget.open || viewed.current) return;
        viewed.current = true;
        onInstructionsViewed?.();
      }}
    >
      <summary>Show me how to get the calendar link</summary>
      <section className="schedulePlatformInstructions">
        <p className="eyebrow">Connect from {platform.name}</p>
        <ol>
          {platform.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
        </ol>
        {platform.caveat ? <p className="fieldHelp">{platform.caveat}</p> : null}
        {platform.officialSupportUrl ? (
          <p className="fieldHelp">
            <a href={platform.officialSupportUrl} target="_blank" rel="noopener noreferrer">
              Official instructions
            </a>
          </p>
        ) : null}
      </section>
    </details>
  );
}
