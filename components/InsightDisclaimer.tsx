export default function InsightDisclaimer({ linkHref = "/content-standards" }: { linkHref?: string }) {
  return (
    <aside
      style={{
        marginTop: 24,
        maxWidth: "680px",
        border: "1px solid rgba(229,231,235,1)", // gray-200
        background: "rgba(249,250,251,1)", // gray-50
        borderRadius: 8,
        padding: "1rem",
      }}
    >
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1f2937" /* gray-800 */ }}>
        Insight, not hype.
      </p>
      <p style={{ marginTop: 6, marginBottom: 0, fontSize: 14, color: "#4b5563", lineHeight: 1.6 }}>
        RefereeInsights collects referee-submitted insight — not public star ratings. Submissions are moderated and focus on
        professionalism, safety, and logistics. Always verify details with the tournament or assignor before accepting.
      </p>
      {linkHref ? (
        <a
          href={linkHref}
          style={{
            marginTop: 8,
            display: "inline-block",
            fontSize: 14,
            color: "#2563eb",
            textDecoration: "underline",
            fontWeight: 500,
          }}
        >
          Read our content standards
        </a>
      ) : null}
    </aside>
  );
}
