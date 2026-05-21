import { getFanaticsLinkAndDisclosure } from "@/lib/partners";

export default async function SoccerWorldCupFanGearCard(props: {
  sport: string | null;
  tournamentId: string;
}) {
  const sport = String(props.sport ?? "").toLowerCase().trim();
  if (sport !== "soccer") return null;

  const res = await getFanaticsLinkAndDisclosure({
    sport: "soccer",
    pageType: "tournament_detail",
    placement: "soccer_tournament_world_cup_fan_gear",
  });

  if (!res.link?.id) return null;

  const qp = new URLSearchParams();
  qp.set("campaign", "world_cup_2026");
  qp.set("placement", "soccer_tournament_world_cup_fan_gear");
  qp.set("page_type", "tournament_detail");
  qp.set("tournament_id", props.tournamentId);

  const href = `/go/partner/${encodeURIComponent(res.link.id)}?${qp.toString()}`;

  return (
    <div
      style={{
        marginTop: 12,
        borderRadius: 12,
        border: "1px solid rgba(15, 61, 46, 0.16)",
        background: "rgba(255,255,255,0.04)",
        padding: "12px 14px",
      }}
      data-partner="fanatics"
      data-placement="soccer_tournament_world_cup_fan_gear"
      data-sport="soccer"
    >
      <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.85, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Tournament weekend extras
      </div>
      <div style={{ marginTop: 6, fontWeight: 950, fontSize: 15 }}>Shop soccer and World Cup fan gear</div>
      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.9 }}>Grab fan gear before tournament weekend.</div>
      <div style={{ marginTop: 10 }}>
        <a
          className="secondaryLink"
          href={href}
          target="_blank"
          rel="sponsored noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            fontWeight: 900,
            textDecoration: "none",
          }}
        >
          Shop fan gear →
        </a>
      </div>
    </div>
  );
}
