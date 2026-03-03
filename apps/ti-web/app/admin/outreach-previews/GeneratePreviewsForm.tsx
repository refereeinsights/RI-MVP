"use client";

import type { CSSProperties, FormEvent } from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function GeneratePreviewsForm({
  initialCampaignId,
  initialSport,
}: {
  initialCampaignId: string;
  initialSport: string;
}) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState(initialCampaignId);
  const [sport, setSport] = useState(initialSport || "soccer");
  const [limit, setLimit] = useState("50");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const disabled = useMemo(() => !campaignId.trim() || !sport.trim(), [campaignId, sport]);

  function buildHref() {
    const params = new URLSearchParams();
    if (campaignId.trim()) params.set("campaign_id", campaignId.trim());
    if (sport.trim()) params.set("sport", sport.trim().toLowerCase());
    return `/admin/outreach-previews?${params.toString()}`;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    startTransition(() => {
      void (async () => {
      const response = await fetch("/api/outreach/generate-previews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          campaign_id: campaignId.trim(),
          sport: sport.trim().toLowerCase(),
          limit: Number(limit),
        }),
      });

      const json = (await response.json().catch(() => ({}))) as { created?: number; error?: string };
      if (!response.ok) {
        setMessage(json.error || "Unable to generate previews.");
        return;
      }

      setMessage(`Created ${json.created ?? 0} preview${json.created === 1 ? "" : "s"}.`);
      router.push(buildHref());
      router.refresh();
      })();
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontWeight: 600 }}>Generate campaign</span>
        <input
          type="text"
          value={campaignId}
          onChange={(event) => setCampaignId(event.target.value)}
          placeholder="soccer_verify_round1_2026-03-03"
          style={inputStyle}
        />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontWeight: 600 }}>Sport</span>
        <input type="text" value={sport} onChange={(event) => setSport(event.target.value)} style={inputStyle} />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontWeight: 600 }}>Limit</span>
        <input
          type="number"
          min={1}
          max={200}
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          style={{ ...inputStyle, minWidth: 110 }}
        />
      </label>
      <button
        type="submit"
        className="cta ti-home-cta ti-home-cta-primary"
        disabled={pending || disabled}
        style={{ opacity: pending || disabled ? 0.7 : 1 }}
      >
        {pending ? "Generating..." : "Generate previews"}
      </button>
      {message ? (
        <p className="muted" style={{ margin: 0 }}>
          {message}
        </p>
      ) : null}
    </form>
  );
}

const inputStyle = {
  minWidth: 220,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "10px 12px",
  font: "inherit",
} satisfies CSSProperties;
