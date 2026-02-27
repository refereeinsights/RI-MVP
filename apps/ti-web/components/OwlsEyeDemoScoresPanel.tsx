import type { OwlsEyeDemoScores } from "@/lib/owlsEyeScores";

function pill(value: "Yes" | "No") {
  const positive = value === "Yes";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 44,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        border: `1px solid ${positive ? "rgba(45, 212, 191, 0.5)" : "rgba(248, 113, 113, 0.5)"}`,
        background: positive ? "rgba(45, 212, 191, 0.15)" : "rgba(248, 113, 113, 0.15)",
      }}
    >
      {value}
    </span>
  );
}

export default function OwlsEyeDemoScoresPanel({ scores }: { scores: OwlsEyeDemoScores }) {
  return (
    <section
      style={{
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: 12,
        padding: 10,
        background: "rgba(0,0,0,0.16)",
        display: "grid",
        gap: 8,
      }}
      aria-label="Owl's Eye demo scores"
    >
      <div style={{ fontSize: 13, fontWeight: 700 }}>Owl&apos;s Eye™ Scores (Demo)</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 8,
          fontSize: 13,
        }}
      >
        <div><strong>Food vendors:</strong> {pill(scores.foodVendors ? "Yes" : "No")}</div>
        <div><strong>Coffee vendors:</strong> {pill(scores.coffeeVendors ? "Yes" : "No")}</div>
        <div><strong>Vendor score:</strong> {scores.vendorScore}</div>
        <div><strong>Restrooms:</strong> {scores.restrooms}</div>
        <div><strong>Restroom cleanliness:</strong> {scores.restroomCleanliness}</div>
        <div><strong>Shade:</strong> {scores.shade}</div>
        <div><strong>Parking:</strong> {scores.parkingLabel}</div>
      </div>
      <div style={{ fontSize: 12, opacity: 0.9 }}>
        Based on {scores.reviewCount} reviews • Updated {scores.updatedLabel}
      </div>
    </section>
  );
}
