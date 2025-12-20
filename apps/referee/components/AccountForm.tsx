"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AccountFormProps = {
  profile: {
    user_id: string;
    email: string;
    handle: string;
    real_name: string | null;
    years_refereeing: number | null;
  };
  badgeImages?: { src: string; alt: string }[];
};

export default function AccountForm({ profile, badgeImages = [] }: AccountFormProps) {
  const [realName, setRealName] = useState(profile.real_name ?? "");
  const [years, setYears] = useState(
    profile.years_refereeing ? String(profile.years_refereeing) : ""
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    const yearsValue = years.trim() ? Number(years) : null;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        real_name: realName.trim(),
        years_refereeing: yearsValue,
      })
      .eq("user_id", profile.user_id);

    if (updateError) {
      setStatus("error");
      setError(updateError.message);
    } else {
      setStatus("saved");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ marginTop: "1.5rem", display: "grid", gap: "1rem" }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#555" }}>Email</div>
        <div style={{ fontSize: 15 }}>{profile.email}</div>
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#555" }}>
          Handle
        </div>
        <div style={{ fontSize: 15 }}>@{profile.handle}</div>
      </div>

      <div style={{ textAlign: "center" }}>
        <label
          style={{
            display: "block",
            fontWeight: 700,
            fontSize: 13,
            marginBottom: 6,
          }}
        >
          Real name
        </label>
        <input
          type="text"
          value={realName}
          onChange={(e) => setRealName(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #bbb",
            textAlign: "center",
          }}
        />
      </div>

      <div style={{ textAlign: "center" }}>
        <label
          style={{
            display: "block",
            fontWeight: 700,
            fontSize: 13,
            marginBottom: 6,
          }}
        >
          Years refereeing
        </label>
        <input
          type="number"
          min={0}
          max={80}
          value={years}
          onChange={(e) => setYears(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #bbb",
            textAlign: "center",
          }}
        />
      </div>

      {badgeImages.length > 0 && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Earned badges</div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            {badgeImages.map((image) => (
              <img
                key={image.src}
                src={image.src}
                alt={image.alt}
                style={{ width: 120, height: "auto" }}
              />
            ))}
          </div>
        </div>
      )}

      {status === "error" && error && (
        <div style={{ color: "#b00020", fontSize: 13 }}>{error}</div>
      )}
      {status === "saved" && (
        <div style={{ color: "#0a7a2f", fontSize: 13, fontWeight: 700 }}>
          Saved!
        </div>
      )}

      <button
        type="submit"
        disabled={status === "saving"}
        style={{
          padding: "12px 16px",
          borderRadius: 14,
          border: "none",
          background: "#111",
          color: "#fff",
          fontWeight: 900,
          cursor: "pointer",
          opacity: status === "saving" ? 0.7 : 1,
        }}
      >
        {status === "saving" ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
