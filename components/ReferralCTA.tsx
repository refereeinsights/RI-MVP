import type { ReferralPlacement } from "@/lib/content/marketing";
import { REFERRAL_PLACEMENTS } from "@/lib/content/marketing";

export default function ReferralCTA({
  placement,
  className,
}: {
  placement: ReferralPlacement;
  className?: string;
}) {
  const block = REFERRAL_PLACEMENTS[placement];
  if (!block) return null;

  return (
    <section
      className={className}
      style={{
        border: "1px solid #111",
        borderRadius: 18,
        padding: "1.5rem",
        background: "#f7f5f0",
        boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      {block.eyebrow && (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#0f3d2e",
            fontWeight: 800,
          }}
        >
          {block.eyebrow}
        </p>
      )}
      <h3 style={{ margin: "0.4rem 0 0", fontSize: 26 }}>{block.title}</h3>
      <p style={{ marginTop: 12, marginBottom: 12, lineHeight: 1.6 }}>{block.body}</p>
      {block.highlights && block.highlights.length > 0 && (
        <ul style={{ paddingLeft: "1.1rem", margin: "0 0 0.75rem" }}>
          {block.highlights.map((item) => (
            <li key={item} style={{ marginBottom: 6, color: "#333", lineHeight: 1.4 }}>
              {item}
            </li>
          ))}
        </ul>
      )}
      {block.copyHint && (
        <p style={{ fontSize: 12, marginTop: 0, color: "#666" }}>{block.copyHint}</p>
      )}
      <a
        href={block.href}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "0.85rem 1.5rem",
          borderRadius: 999,
          background: "#0f3d2e",
          color: "#fff",
          fontWeight: 800,
          textDecoration: "none",
          marginTop: 12,
        }}
      >
        {block.ctaLabel} ↗
      </a>
    </section>
  );
}
