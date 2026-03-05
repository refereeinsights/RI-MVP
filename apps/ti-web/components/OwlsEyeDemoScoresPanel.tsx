import type { OwlsEyeDemoScores } from "@/lib/owlsEyeScores";

function pill(value: "Yes" | "No" | "—" | "Locked") {
  const positive = value === "Yes";
  const neutral = value === "—";
  const locked = value === "Locked";
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
          : locked
          ? "1px solid rgba(148, 163, 184, 0.45)"
          : `1px solid ${positive ? "rgba(45, 212, 191, 0.5)" : "rgba(248, 113, 113, 0.5)"}`,
        background: neutral
          ? "rgba(148, 163, 184, 0.15)"
          : locked
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

export default function OwlsEyeDemoScoresPanel({
  scores,
  isDemo = false,
  tier,
  showAll = false,
}: {
  scores: OwlsEyeDemoScores;
  isDemo?: boolean;
  tier: "explorer" | "insider" | "weekend_pro";
  showAll?: boolean;
}) {
  const effectiveTier = showAll ? "weekend_pro" : tier;
  const visibility = {
    foodVendors: true,
    coffeeVendors: true,
    vendorScore: effectiveTier !== "explorer",
    shade: effectiveTier !== "explorer",
    parkingConvenience: effectiveTier !== "explorer",
    bringFieldChairs: effectiveTier !== "explorer",
    reviewCount: effectiveTier !== "explorer",
    restrooms: effectiveTier === "weekend_pro",
    restroomCleanliness: effectiveTier === "weekend_pro",
    playerParkingFee: effectiveTier === "weekend_pro",
    parkingNotes: effectiveTier === "weekend_pro",
    seatingNotes: effectiveTier === "weekend_pro",
  };

  const renderNotes = (value: string, id: string) => {
    if (value === "—") return <span>—</span>;
    const lines = value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return <span>—</span>;
    return (
      <div id={id} style={{ display: "grid", gap: 2 }}>
      {lines.map((line, idx) => (
        <div key={`${id}-${idx}`}>{line}</div>
      ))}
    </div>
    );
  };

  const lockedPill = () => pill("Locked");
  const lockedText = () => <span>Locked</span>;

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
      <div style={{ fontSize: 13, fontWeight: 700 }}>
        Owl&apos;s Eye™ Scores{isDemo ? " (Demo)" : ""}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 8,
          fontSize: 13,
        }}
      >
        <div>
          <strong>On-site food vendors:</strong>{" "}
          {visibility.foodVendors ? pill(scores.foodVendors) : lockedPill()}
        </div>
        <div>
          <strong>On-site coffee vendors:</strong>{" "}
          {visibility.coffeeVendors ? pill(scores.coffeeVendors) : lockedPill()}
        </div>
        <div>
          <strong>Vendor score:</strong> {visibility.vendorScore ? scores.vendorScore : lockedText()}
        </div>
        <div>
          <strong>Restrooms:</strong> {visibility.restrooms ? scores.restrooms : lockedText()}
        </div>
        <div>
          <strong>Restroom cleanliness:</strong>{" "}
          {visibility.restroomCleanliness ? scores.restroomCleanliness : lockedText()}
        </div>
        <div>
          <strong>Shade:</strong> {visibility.shade ? scores.shade : lockedText()}
        </div>
        <div>
          <strong>Bring field chairs:</strong>{" "}
          {visibility.bringFieldChairs ? scores.bringFieldChairs : lockedText()}
        </div>
        <div>
          <strong>Seating notes:</strong>{" "}
          {visibility.seatingNotes ? renderNotes(scores.seatingNotes, "seating-notes") : lockedText()}
        </div>
        <div>
          <strong>Player parking fee:</strong>{" "}
          {visibility.playerParkingFee ? scores.playerParkingFee : lockedText()}
        </div>
        <div>
          <strong>Parking:</strong> {visibility.parkingConvenience ? scores.parkingLabel : lockedText()}
        </div>
        <div>
          <strong>Parking notes:</strong>{" "}
          {visibility.parkingNotes ? renderNotes(scores.parkingNotes, "parking-notes") : lockedText()}
        </div>
      </div>
      {visibility.reviewCount ? (
        <div style={{ fontSize: 12, opacity: 0.9 }}>
          Based on {scores.reviewCount} reviews • Updated {scores.updatedLabel}
        </div>
      ) : (
        <div style={{ fontSize: 12, opacity: 0.9 }}>Review counts locked.</div>
      )}
    </section>
  );
}
