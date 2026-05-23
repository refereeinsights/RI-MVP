export default function SoccerWorldCupFanGearCard(props: { href: string }) {
  return (
    <div
      style={{
        marginTop: 6,
        borderRadius: 16,
        background: "#0f2d1e",
        padding: "32px 28px",
        textAlign: "center",
      }}
      data-partner="fanatics"
      data-placement="soccer_tournament_world_cup_fan_gear"
      data-sport="soccer"
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#7ec99a",
          marginBottom: 10,
        }}
      >
        TOURNAMENT WEEKEND EXTRAS
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "#ffffff",
          lineHeight: 1.25,
          marginBottom: 8,
        }}
      >
        Shop national team soccer gear
      </div>
      <div style={{ fontSize: 15, color: "#b8d4c0", marginBottom: 22 }}>
        Show your colors for a huge summer of international soccer.
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <a
          href={props.href}
          target="_blank"
          rel="sponsored noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 22px",
            borderRadius: 8,
            background: "#2d7a4f",
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Shop fan gear →
        </a>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            flexWrap: "wrap",
            fontSize: 22,
            color: "#ffffff",
          }}
        >
          <span title="USA">🇺🇸 USA</span>
          <span title="Canada">🇨🇦 Canada</span>
          <span title="Brazil">🇧🇷 Brazil</span>
          <span title="Germany">🇩🇪 Germany</span>
          <span title="Argentina">🇦🇷 Argentina</span>
          <span title="Mexico">🇲🇽 Mexico</span>
        </div>
      </div>
    </div>
  );
}
