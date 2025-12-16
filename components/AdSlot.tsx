import type { AdPlacement } from "@/lib/content/marketing";
import { AD_PLACEMENTS } from "@/lib/content/marketing";

export default function AdSlot({
  placement,
  className,
}: {
  placement: AdPlacement;
  className?: string;
}) {
  const ad = AD_PLACEMENTS[placement];
  if (!ad) return null;

  return (
    <div
      className={className}
      style={{
        borderRadius: 16,
        padding: "1.25rem",
        background: ad.background ?? "#0f3d2e",
        color: "#fff",
        boxShadow: "0 12px 28px rgba(0,0,0,0.25)",
        border: "1px solid rgba(255,255,255,0.25)",
        maxWidth: 420,
      }}
    >
      {ad.eyebrow && (
        <div
          style={{
            fontSize: 12,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            opacity: 0.8,
            marginBottom: 6,
          }}
        >
          {ad.eyebrow}
        </div>
      )}
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>{ad.title}</div>
      <p style={{ margin: 0, lineHeight: 1.5 }}>{ad.body}</p>
      <a
        href={ad.href}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          marginTop: 14,
          padding: "0.5rem 0.9rem",
          borderRadius: 999,
          background: "#fff",
          color: "#0b1f17",
          fontWeight: 800,
          textDecoration: "none",
        }}
      >
        {ad.ctaLabel} ↗
      </a>
    </div>
  );
}
