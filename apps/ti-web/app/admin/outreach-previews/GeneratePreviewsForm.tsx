"use client";

import type { CSSProperties, FormEvent } from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TI_SPORT_LABELS, type TiSport } from "@/lib/tiSports";

export default function GeneratePreviewsForm({
  initialCampaignId,
  initialSport,
  initialStartAfter,
  sports,
}: {
  initialCampaignId: string;
  initialSport: string;
  initialStartAfter: string;
  sports: readonly TiSport[];
}) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState(initialCampaignId);
  const [sport, setSport] = useState((initialSport || sports[0] || "soccer").trim().toLowerCase());
  const [limit, setLimit] = useState("50");
  const [startAfter, setStartAfter] = useState(initialStartAfter);
  const [mode, setMode] = useState<"preview" | "send">("preview");
  const [emailKind, setEmailKind] = useState<"intro_reply" | "verify_link">("intro_reply");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const disabled = useMemo(() => !campaignId.trim() || !sport.trim(), [campaignId, sport]);

  function buildHref() {
    const params = new URLSearchParams();
    if (campaignId.trim()) params.set("campaign_id", campaignId.trim());
    if (sport.trim()) params.set("sport", sport.trim().toLowerCase());
    if (startAfter.trim()) params.set("start_after", startAfter.trim());
    return `/admin/outreach-previews?${params.toString()}`;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (disabled) {
      setMessage("Campaign and sport are required.");
      return;
    }

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
          mode,
          start_after: startAfter.trim() || undefined,
          email_kind: emailKind,
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
        <select value={sport} onChange={(event) => setSport(event.target.value)} style={inputStyle}>
          {sports.map((value) => (
            <option key={value} value={value}>
              {TI_SPORT_LABELS[value] ?? value}
            </option>
          ))}
        </select>
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
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontWeight: 600 }}>Start after</span>
        <input
          type="date"
          value={startAfter}
          onChange={(event) => setStartAfter(event.target.value)}
          style={{ ...inputStyle, minWidth: 180 }}
        />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontWeight: 600 }}>Mode</span>
        <select value={mode} onChange={(event) => setMode(event.target.value as "preview" | "send")} style={inputStyle}>
          <option value="preview">Preview only</option>
          <option value="send">Send emails</option>
        </select>
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontWeight: 600 }}>Email</span>
        <select
          value={emailKind}
          onChange={(event) => setEmailKind(event.target.value as "intro_reply" | "verify_link")}
          style={inputStyle}
        >
          <option value="intro_reply">Intro (reply only)</option>
          <option value="verify_link">Verify link (existing)</option>
        </select>
      </label>
      <button
        type="submit"
        className="cta ti-home-cta ti-home-cta-primary"
        disabled={pending}
        style={{ opacity: pending ? 0.7 : 1 }}
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
