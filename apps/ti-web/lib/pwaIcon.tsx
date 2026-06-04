import fs from "node:fs";
import path from "node:path";

const ICON_BACKGROUND = "#0F5034";
const ICON_MARK_FILL = "#ffffff";
const ICON_PADDING = 77;
const ICON_INNER_SIZE = 358;
const ICON_CORNER_RADIUS = 108;

const markSvg = (() => {
  const svgPath = path.join(process.cwd(), "public/svg/ti/tournamentinsights_mark_transparent.svg");
  const raw = fs.readFileSync(svgPath, "utf8");
  const inner = raw
    .replace(/^[\s\S]*?<svg[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "")
    .replace(/#3470ba/gi, ICON_MARK_FILL)
    .replace(/#9ab8dd/gi, ICON_MARK_FILL);
  return `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="470 220 660 600">${inner}</svg>`
  ).toString("base64")}`;
})();

export const pwaIconMeta = {
  backgroundColor: ICON_BACKGROUND,
  markColor: ICON_MARK_FILL,
  preferredSourceAsset: "/svg/ti/tournamentinsights_mark_transparent.svg",
};

export function PwaIconMarkup({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: ICON_BACKGROUND,
        borderRadius: Math.round((ICON_CORNER_RADIUS / 512) * size),
      }}
    >
      <img
        src={markSvg}
        alt=""
        width={Math.round((ICON_INNER_SIZE / 512) * size)}
        height={Math.round((ICON_INNER_SIZE / 512) * size)}
        style={{
          display: "block",
          objectFit: "contain",
          padding: Math.round((ICON_PADDING / 512) * size),
        }}
      />
    </div>
  );
}
