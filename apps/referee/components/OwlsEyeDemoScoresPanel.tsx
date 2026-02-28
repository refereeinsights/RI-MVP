import type { OwlsEyeDemoScores } from "@/lib/owlsEyeScores";

function pill(value: "Yes" | "No" | "—") {
  const positive = value === "Yes";
  const neutral = value === "—";
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
        border: neutral
          ? "1px solid rgba(148, 163, 184, 0.45)"
          : `1px solid ${positive ? "rgba(45, 212, 191, 0.5)" : "rgba(248, 113, 113, 0.5)"}`,
        background: neutral
          ? "rgba(148, 163, 184, 0.15)"
          : positive
            ? "rgba(45, 212, 191, 0.15)"
            : "rgba(248, 113, 113, 0.15)",
      }}
    >
      {value}
    </span>
  );
}

export default function OwlsEyeDemoScoresPanel({ scores }: { scores: OwlsEyeDemoScores }) {
  const renderNotes = (value: string, id: string) => {
    if (value === "—") return <span>—</span>;
    const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return <span>—</span>;
    return (
      <div id={id} style={{ display: "grid", gap: 2 }}>
        {lines.map((line, idx) => (
          <div key={`${id}-${idx}`}>{line}</div>
        ))}
      </div>
    );
  };

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
      aria-label="Owl's Eye venue scores"
    >
      <div style={{ fontSize: 13, fontWeight: 700 }}>Owl&apos;s Eye™ Scores</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 8,
          fontSize: 13,
        }}
      >
        <div><strong>On-site food vendors:</strong> {pill(scores.foodVendors)}</div>
        <div><strong>On-site coffee vendors:</strong> {pill(scores.coffeeVendors)}</div>
        <div><strong>Vendor score:</strong> {scores.vendorScore}</div>
        <div><strong>Restrooms:</strong> {scores.restrooms}</div>
        <div><strong>Restroom cleanliness:</strong> {scores.restroomCleanliness}</div>
        <div><strong>Shade:</strong> {scores.shade}</div>
        <div><strong>Bring field chairs:</strong> {scores.bringFieldChairs}</div>
        <div><strong>Seating notes:</strong> {renderNotes(scores.seatingNotes, "seating-notes")}</div>
        <div><strong>Player parking fee:</strong> {scores.playerParkingFee}</div>
        <div><strong>Parking:</strong> {scores.parkingLabel}</div>
        <div><strong>Parking notes:</strong> {renderNotes(scores.parkingNotes, "parking-notes")}</div>
      </div>
      <div style={{ fontSize: 12, opacity: 0.9 }}>Based on {scores.reviewCount} reviews • Updated {scores.updatedLabel}</div>
    </section>
  );
}
