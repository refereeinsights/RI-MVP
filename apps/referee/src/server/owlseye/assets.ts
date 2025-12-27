type Sport = "soccer" | "basketball";
type AssetKind = "map" | "evidence" | "pdf";
type AssetExt = "png" | "jpg" | "pdf";

function compactTimestamp(iso: string): string {
  const safe = iso && typeof iso === "string" ? iso : "";
  const trimmed = safe.trim();
  if (!trimmed) return "unknown";
  // Remove characters that do not play nicely in paths (colons, dots, dashes)
  const compact = trimmed.replace(/[:.]/g, "").replace(/-/g, "");
  return compact;
}

export function makeOwlAssetPath(args: {
  venue_id: string;
  sport: Sport;
  computed_at_iso: string;
  kind: AssetKind;
  ext: AssetExt;
  index?: number;
}): string {
  const version = compactTimestamp(args.computed_at_iso);
  const baseDir = `owls-eye/${args.venue_id}/${args.sport}/${version}`;
  const suffix = typeof args.index === "number" ? `_${args.index}` : "";
  return `${baseDir}/${args.kind}${suffix}.${args.ext}`;
}
