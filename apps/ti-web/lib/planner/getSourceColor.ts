const MANUAL_COLOR = "#6b7280";

export const SOURCE_COLOR_PALETTE = ["#4a7fa5", "#c9933a", "#7c5cbf", "#3a9e8f", "#c0523a"] as const;

function normalizeSourceId(sourceId: string | null | undefined): string | null {
  const v = String(sourceId ?? "").trim();
  return v ? v : null;
}

export function getSourceColor(sourceId: string | null, allSourceIds: string[]): string {
  const normalized = normalizeSourceId(sourceId);
  if (!normalized) return MANUAL_COLOR;

  const ids = Array.from(new Set((allSourceIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
  const idx = ids.indexOf(normalized);
  const paletteIdx = idx >= 0 ? idx % SOURCE_COLOR_PALETTE.length : 0;
  return SOURCE_COLOR_PALETTE[paletteIdx] ?? MANUAL_COLOR;
}

