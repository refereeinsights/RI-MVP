export type SemanticListItem = {
  id: string;
  label: string;
  href?: string | null;
};

export type SemanticListOverflow =
  | { kind: "none" }
  | { kind: "unknown" }
  | { kind: "known"; remainingCount: number };

export type SemanticListPart =
  | { type: "text"; value: string }
  | { type: "link"; href: string; label: string };

export type FormatEntityListResult = {
  parts: SemanticListPart[];
  totalUnique: number;
  shown: number;
  overflow: SemanticListOverflow;
};

export type FormatEntityListOptions = {
  maxItems: number;
  overflowNoun?: string | null; // e.g. "venues"
  overflow?: SemanticListOverflow;
  truncateLabelAt?: number;
};

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncateLabel(label: string, maxLen: number) {
  const s = clean(label);
  if (s.length <= maxLen) return s;
  const clipped = s.slice(0, maxLen);
  const lastSpace = clipped.lastIndexOf(" ");
  const out = lastSpace > Math.floor(maxLen * 0.6) ? clipped.slice(0, lastSpace) : clipped;
  return `${out}…`;
}

function defaultOverflowFor(totalUnique: number, maxItems: number): SemanticListOverflow {
  if (totalUnique <= maxItems) return { kind: "none" };
  return { kind: "unknown" };
}

export function formatEntityList(items: SemanticListItem[], options: FormatEntityListOptions): FormatEntityListResult {
  const maxItems = Math.max(1, Math.floor(options.maxItems || 1));
  const truncateAt = typeof options.truncateLabelAt === "number" ? Math.max(20, options.truncateLabelAt) : null;

  const byId = new Map<string, SemanticListItem>();
  for (const item of items ?? []) {
    const id = String(item?.id ?? "").trim();
    const labelRaw = typeof item?.label === "string" ? item.label : "";
    const label = clean(labelRaw);
    if (!id || !label) continue;
    if (byId.has(id)) continue;
    byId.set(id, { id, label, href: item?.href ?? null });
  }

  const unique = Array.from(byId.values());
  const totalUnique = unique.length;
  const shownItems = unique.slice(0, maxItems).map((it) => ({
    ...it,
    label: truncateAt ? truncateLabel(it.label, truncateAt) : it.label,
  }));

  const parts: SemanticListPart[] = [];
  const pushItem = (it: { label: string; href?: string | null }) => {
    if (it.href) parts.push({ type: "link", href: it.href, label: it.label });
    else parts.push({ type: "text", value: it.label });
  };

  if (shownItems.length === 1) {
    pushItem(shownItems[0]);
  } else if (shownItems.length === 2) {
    pushItem(shownItems[0]);
    parts.push({ type: "text", value: " and " });
    pushItem(shownItems[1]);
  } else if (shownItems.length >= 3) {
    shownItems.forEach((it, idx) => {
      const isLast = idx === shownItems.length - 1;
      const isSecondLast = idx === shownItems.length - 2;
      pushItem(it);
      if (!isLast) {
        parts.push({ type: "text", value: isSecondLast ? ", and " : ", " });
      }
    });
  }

  const overflow =
    options.overflow ??
    (totalUnique > maxItems ? defaultOverflowFor(totalUnique, maxItems) : { kind: "none" });

  if (totalUnique > maxItems) {
    const noun = clean(options.overflowNoun ?? "");
    if (overflow.kind === "known" && overflow.remainingCount > 0) {
      parts.push({ type: "text", value: ` (and ${overflow.remainingCount} more${noun ? ` ${noun}` : ""})` });
    } else if (overflow.kind !== "none") {
      parts.push({ type: "text", value: ` (and more${noun ? ` ${noun}` : ""})` });
    }
  }

  return {
    parts,
    totalUnique,
    shown: shownItems.length,
    overflow: totalUnique > maxItems ? overflow : { kind: "none" },
  };
}

