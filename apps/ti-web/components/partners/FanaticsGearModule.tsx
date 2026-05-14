import { getFanaticsLinkAndDisclosure } from "@/lib/partners";

export default async function FanaticsGearModule(props: {
  sport?: string;
  placement?: "tournament_page" | "venue_page" | "gear_hub" | "homepage";
  title?: string;
  description?: string;
  tournamentId?: string;
  venueId?: string;
  pageType?: string;
  campaign?: string;
}) {
  const placement = props.placement ?? null;
  const pageType = props.pageType ?? null;
  const sport = props.sport ?? null;

  const res = await getFanaticsLinkAndDisclosure({
    sport,
    placement,
    pageType,
  });

  if (!res.ok || !res.link?.id) return null;

  const title = props.title ?? "Gear Up for Tournament Weekend";
  const description =
    props.description ?? "Shop fan gear, jerseys, hats, apparel, and tournament essentials from Fanatics.";

  const qp = new URLSearchParams();
  if (props.tournamentId) qp.set("tournament_id", String(props.tournamentId));
  if (props.venueId) qp.set("venue_id", String(props.venueId));
  if (props.pageType) qp.set("page_type", String(props.pageType));
  if (props.campaign) qp.set("campaign", String(props.campaign));
  if (props.placement) qp.set("placement", String(props.placement));

  const href = `/go/partner/${encodeURIComponent(res.link.id)}${qp.toString() ? `?${qp.toString()}` : ""}`;

  return (
    <div
      style={{
        border: "1px solid rgba(15, 61, 46, 0.12)",
        borderRadius: 14,
        background: "#fff",
        padding: 14,
        display: "grid",
        gap: 10,
      }}
      data-partner="fanatics"
      data-placement={props.placement ?? ""}
      data-sport={props.sport ?? ""}
      data-sub-id-1={res.link.sub_id_1 ?? ""}
      data-sub-id-2={res.link.sub_id_2 ?? ""}
      data-sub-id-3={res.link.sub_id_3 ?? ""}
    >
      <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: "0.06em", textTransform: "uppercase", color: "#0b1f14" }}>
        Partner
      </div>

      <div style={{ fontSize: 18, fontWeight: 950, color: "#0b1f14", lineHeight: 1.2 }}>{title}</div>
      <div style={{ color: "rgba(16, 34, 19, 0.85)", fontWeight: 650, fontSize: 13, lineHeight: 1.45 }}>{description}</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <a className="primaryLink" href={href} target="_blank" rel="sponsored noopener noreferrer">
          Shop Fan Gear
        </a>
        {res.disclosureText ? (
          <div style={{ color: "rgba(16, 34, 19, 0.75)", fontWeight: 650, fontSize: 12, lineHeight: 1.35 }}>
            {res.disclosureText}
          </div>
        ) : null}
      </div>
    </div>
  );
}

