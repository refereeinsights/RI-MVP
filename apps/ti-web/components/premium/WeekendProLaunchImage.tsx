"use client";

import { useState } from "react";

export default function WeekendProLaunchImage(props: { className?: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;

  return (
    <img
      src="/brand/weekend-pro-launch.png"
      alt="Weekend Pro"
      className={props.className}
      style={{
        width: "min(860px, 100%)",
        height: 200,
        objectFit: "cover",
        objectPosition: "center",
        borderRadius: 16,
        border: "1px solid rgba(15, 23, 42, 0.12)",
        boxShadow: "0 14px 40px rgba(0,0,0,0.12)",
        display: "block",
        margin: "14px auto 0",
      }}
      onError={() => setOk(false)}
    />
  );
}

