import { getFanaticsLinkAndDisclosure } from "@/lib/partners";
import { resolveFanaticsAffiliateDisclosureText } from "./fanaticsDisclosure";

export default async function FanaticsGearModule(props: {
  sport?: string;
  placement?: string;
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
  const disclosure = resolveFanaticsAffiliateDisclosureText(res.disclosureText);

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
      data-placement={props.placement ?? ""}
      data-sport={props.sport ?? ""}
      data-sub-id-1={res.link.sub_id_1 ?? ""}
      data-sub-id-2={res.link.sub_id_2 ?? ""}
      data-sub-id-3={res.link.sub_id_3 ?? ""}
    >
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7ec99a" }}>
        TOURNAMENT WEEKEND EXTRAS
      </div>

      <div style={{ fontSize: 24, fontWeight: 700, color: "#ffffff", lineHeight: 1.25, marginTop: 10 }}>{title}</div>
      <div style={{ fontSize: 15, color: "#b8d4c0", marginTop: 8 }}>{description}</div>

      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: 18 }}>
        <a
          href={href}
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
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Shop fan gear →
        </a>
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: "rgba(184, 212, 192, 0.92)", lineHeight: 1.35 }}>
        {disclosure}
      </div>
    </div>
  );
}
