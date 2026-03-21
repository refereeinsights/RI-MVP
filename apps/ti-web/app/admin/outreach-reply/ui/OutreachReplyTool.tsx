"use client";

import { useMemo, useState, useTransition } from "react";
import CopyFieldButton from "@/app/admin/outreach-previews/CopyFieldButton";
import { TI_SPORT_LABELS, TI_SPORTS, type TiSport } from "@/lib/tiSports";

type ReplyResult = {
  sport: string;
  directorEmail: string;
  tournamentIds: string[];
  tournamentCount: number;
  subject: string;
  html: string;
  text: string;
};

export default function OutreachReplyTool() {
  const todayYmd = useMemo(() => new Date().toISOString().slice(0, 10).replace(/-/g, ""), []);
  const [email, setEmail] = useState("");
  const [sport, setSport] = useState<TiSport>("soccer");
  const [campaignId, setCampaignId] = useState(`verify-reply-${todayYmd}`);
  const [limit, setLimit] = useState(10);
  const [result, setResult] = useState<ReplyResult | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);

    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch("/api/outreach/generate-verify-reply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              sport,
              campaign_id: campaignId,
              limit,
            }),
          });

          const json = (await res.json()) as any;
          if (!res.ok) {
            setError(json?.error || `Request failed (${res.status}).`);
            return;
          }
          setResult(json as ReplyResult);
        } catch (err: any) {
          setError(err?.message || "Request failed.");
        }
      })();
    });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
      <form
        onSubmit={onSubmit}
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 14,
          background: "#ffffff",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Director email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="director@example.com"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #cbd5e1",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Sport</div>
            <select
              value={sport}
              onChange={(e) => setSport(e.target.value as any)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #cbd5e1",
                background: "#ffffff",
              }}
            >
              {TI_SPORTS.map((s) => (
                <option key={s} value={s}>
                  {TI_SPORT_LABELS[s] ?? s}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>Max tournaments</div>
            <input
              type="number"
              min={1}
              max={20}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #cbd5e1",
              }}
            />
          </label>
        </div>

        <div style={{ height: 12 }} />

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 800 }}>UTM campaign_id</div>
            <input
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              placeholder="verify-reply-YYYYMMDD"
              autoCapitalize="none"
              autoCorrect="off"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #cbd5e1",
              }}
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            style={{
              borderRadius: 10,
              border: "1px solid #0f172a",
              background: pending ? "#0f172a" : "#111827",
              color: "#ffffff",
              padding: "10px 12px",
              fontWeight: 900,
              cursor: pending ? "default" : "pointer",
            }}
          >
            {pending ? "Generating..." : "Generate"}
          </button>
        </div>

        {error ? (
          <div style={{ marginTop: 12, color: "#b91c1c", fontWeight: 800 }}>
            {error}
          </div>
        ) : null}
      </form>

      {result ? (
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 14,
            background: "#ffffff",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 900 }}>
              {result.directorEmail} - {result.tournamentCount} tournament(s)
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <CopyFieldButton label="Copy subject" value={result.subject} />
              <CopyFieldButton label="Copy HTML" value={result.html} />
              <CopyFieldButton label="Copy text" value={result.text} />
            </div>
          </div>

          <div style={{ height: 12 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 900 }}>HTML preview</div>
              <iframe
                title="Reply email HTML preview"
                sandbox=""
                style={{ width: "100%", height: 520, borderRadius: 10, border: "1px solid #cbd5e1" }}
                srcDoc={result.html}
              />
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 900 }}>Plain text</div>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  margin: 0,
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  height: 520,
                  overflow: "auto",
                }}
              >
                {result.text}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
