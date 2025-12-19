export default function DecisionSignals() {
  return (
    <aside
      style={{
        marginTop: 24,
        marginBottom: 20,
        maxWidth: 720,
        border: "1px solid #e5e7eb",
        background: "#f8fafc",
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <h2
        style={{
          margin: 0,
          fontWeight: 600,
          color: "#111827",
          fontSize: 16,
        }}
      >
        Decision signals referees look for
      </h2>
      <p
        style={{
          marginTop: 8,
          marginBottom: 12,
          color: "#4b5563",
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        These are common factors officials consider when deciding whether to accept a tournament. Individual
        experiences may vary.
      </p>
      <ul
        style={{
          margin: "0 0 12px",
          paddingLeft: 18,
          color: "#1f2937",
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        <li>Pay clarity (rates posted clearly and paid on time)</li>
        <li>Assignor communication (clear, responsive updates)</li>
        <li>Schedule reliability (on-time games, reasonable changes)</li>
        <li>Field or facility conditions (safe, prepared venues)</li>
        <li>On-site support (staffing, hydration, conflict handling)</li>
      </ul>
      <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
        Referee insights help add real-world context to these signals.
      </p>
    </aside>
  );
}
