import Link from "next/link";
import { getMetroMarketsForState } from "../_lib/getMetroMarketsForState";

type Props = {
  stateCode: string;
  sports?: string[];
  q?: string;
  month?: string;
  includePast?: boolean;
  aysoOnly?: boolean;
  title?: string;
};

function buildMetroHref({
  slug,
  stateCode,
  sports,
  q,
  month,
  includePast,
  aysoOnly,
}: {
  slug: string;
  stateCode: string;
  sports?: string[];
  q?: string;
  month?: string;
  includePast?: boolean;
  aysoOnly?: boolean;
}) {
  const params = new URLSearchParams();
  const safeQ = (q ?? "").trim();
  const safeMonth = (month ?? "").trim();
  const safeState = (stateCode ?? "").trim().toUpperCase();
  if (safeQ) params.set("q", safeQ);
  if (safeMonth) params.set("month", safeMonth);
  if (safeState) params.set("state", safeState);
  if (includePast) params.set("includePast", "true");
  if (aysoOnly) params.set("aysoOnly", "true");
  for (const sport of (sports ?? []).map((s) => (s ?? "").trim().toLowerCase()).filter(Boolean)) {
    params.append("sports", sport);
  }
  const qs = params.toString();
  return `/tournaments/metro/${slug}${qs ? `?${qs}` : ""}`;
}

export default async function MetroMarketChips({
  stateCode,
  sports,
  q,
  month,
  includePast,
  aysoOnly,
  title = "Explore by area",
}: Props) {
  const st = (stateCode ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(st)) return null;

  const markets = await getMetroMarketsForState(st);
  if (!markets.length) return null;

  const singleState = markets.filter((m) => m.states.length === 1 && m.states[0] === st);
  const multiState = markets.filter((m) => m.states.length > 1);

  const singleStateTrimmed = singleState.slice(0, 8);
  const multiStateTrimmed = multiState.slice(0, 8);

  const renderChip = (label: string, href: string, hint?: string) => (
    <Link key={href} href={href} className="areaChip" aria-label={hint ? `${label} (${hint})` : label}>
      <span className="areaChipLabel">{label}</span>
      {hint ? <span className="areaChipHint">{hint}</span> : null}
    </Link>
  );

  return (
    <section className="bodyCard" aria-label="Area filters">
      <div className="areaHeader">
        <div className="areaTitle">{title}</div>
        <div className="areaSubtitle">
          Jump into a metro/region view (you can still filter back to {st} on the next page).
        </div>
      </div>

      {singleStateTrimmed.length ? (
        <div className="areaGroup">
          <div className="areaGroupLabel">Within {st}</div>
          <div className="areaChips">
            {singleStateTrimmed.map((m) =>
              renderChip(
                m.name,
                buildMetroHref({ slug: m.slug, stateCode: st, sports, q, month, includePast, aysoOnly })
              )
            )}
          </div>
        </div>
      ) : null}

      {multiStateTrimmed.length ? (
        <div className="areaGroup">
          <div className="areaGroupLabel">Nearby regions</div>
          <div className="areaChips">
            {multiStateTrimmed.map((m) =>
              renderChip(
                m.name,
                buildMetroHref({ slug: m.slug, stateCode: st, sports, q, month, includePast, aysoOnly }),
                m.states.join(", ")
              )
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

