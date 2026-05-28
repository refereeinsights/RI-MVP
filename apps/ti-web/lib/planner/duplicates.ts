import type { PlannerEventRow } from "@/lib/planner/types";

export type PlannerDuplicateConfidence = "high" | "low";
export type PlannerDuplicateReason = "time" | "title" | "location" | "team" | "timezone";

export type PlannerDuplicateCandidate = {
  eventId: string;
  candidateEventId: string;
  confidence: PlannerDuplicateConfidence;
  score: number;
  reasons: PlannerDuplicateReason[];
};

const GENERIC_TOKENS = new Set([
  "game",
  "practice",
  "tournament",
  "event",
  "field",
  "vs",
  "at",
  "the",
  "a",
  "an",
  "and",
  "or",
]);

function safeTimeZone(tz: string | null) {
  const v = String(tz ?? "").trim();
  if (!v || v.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v }).format(new Date());
    return v;
  } catch {
    return null;
  }
}

function localDateKey(iso: string, tz: string) {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const day = parts.find((p) => p.type === "day")?.value ?? "";
    if (!y || !m || !day) return null;
    return `${y}-${m}-${day}`;
  } catch {
    return null;
  }
}

function normalizeTitle(title: string) {
  let v = String(title ?? "").trim().toLowerCase();
  if (!v) return "";
  v = v.replace(/\[[^\]]+\]\s*/g, ""); // strip bracketed prefixes
  v = v.replace(/[^\p{L}\p{N}\s]/gu, " ");
  v = v.replace(/\s+/g, " ").trim();
  return v;
}

function titleTokens(title: string) {
  const v = normalizeTitle(title);
  if (!v) return [];
  return v
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !GENERIC_TOKENS.has(t));
}

function normalizeLocationParts(e: PlannerEventRow) {
  const parts = [e.address_text, e.city, e.state]
    .map((x) => String(x ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (!parts) return [];
  const v = parts.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (!v) return [];
  return v
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !GENERIC_TOKENS.has(t));
}

function overlapScore(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let overlap = 0;
  for (const t of setA) if (setB.has(t)) overlap += 1;
  const denom = Math.max(1, Math.min(setA.size, setB.size));
  return overlap / denom;
}

function isIcsEvent(e: PlannerEventRow) {
  return String(e.source_type ?? "") === "ics";
}

function hasStableIcsIdentity(e: PlannerEventRow) {
  const sid = String(e.source_id ?? "").trim();
  const uid = String((e as any).source_event_uid ?? "").trim();
  return Boolean(sid && uid);
}

function buildDismissKeyForEvent(e: PlannerEventRow) {
  if (isIcsEvent(e)) {
    if (!hasStableIcsIdentity(e)) return null;
    return `ics:${String(e.source_id).trim()}:${String((e as any).source_event_uid).trim()}`;
  }
  const id = String(e.id ?? "").trim();
  return id ? `manual:${id}` : null;
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function computeDuplicateCandidates(args: {
  events: PlannerEventRow[];
  dismissedPairs: Array<{ pair_key_a: string; pair_key_b: string }>;
  timeZoneFallback?: string;
}): PlannerDuplicateCandidate[] {
  const events = (args.events ?? []).slice();
  if (!events.length) return [];

  const tzFallback = safeTimeZone(args.timeZoneFallback ?? null) || "UTC";

  const dismissed = new Set(
    (args.dismissedPairs ?? [])
      .map((p) => {
        const a = String((p as any).pair_key_a ?? "").trim();
        const b = String((p as any).pair_key_b ?? "").trim();
        if (!a || !b) return null;
        return pairKey(a, b);
      })
      .filter(Boolean) as string[]
  );

  const enriched = events
    .map((e) => {
      const tz = safeTimeZone(e.timezone) || tzFallback;
      const dateKey = localDateKey(e.starts_at, tz);
      const titleToks = titleTokens(e.title);
      const locToks = normalizeLocationParts(e);
      const dismissKey = buildDismissKeyForEvent(e);
      return { e, tz, dateKey, titleToks, locToks, dismissKey };
    })
    .filter((x) => Boolean(x.dateKey));

  const out: PlannerDuplicateCandidate[] = [];
  const bestByEvent = new Map<string, PlannerDuplicateCandidate[]>();

  // Compare all pairs within the bounded event set (<=200).
  for (let i = 0; i < enriched.length; i++) {
    for (let j = i + 1; j < enriched.length; j++) {
      const a = enriched[i]!;
      const b = enriched[j]!;

      // Only consider ics↔ics and manual↔ics (exclude manual↔manual).
      const aIcs = isIcsEvent(a.e);
      const bIcs = isIcsEvent(b.e);
      if (!(aIcs || bIcs)) continue;
      if (!aIcs && !bIcs) continue;

      // For ics↔ics, require different sources.
      if (aIcs && bIcs) {
        const sidA = String(a.e.source_id ?? "").trim();
        const sidB = String(b.e.source_id ?? "").trim();
        if (!sidA || !sidB) continue;
        if (sidA === sidB) continue;
        // Ensure stable identities so we can dismiss reliably.
        if (!hasStableIcsIdentity(a.e) || !hasStableIcsIdentity(b.e)) continue;
      } else {
        // manual↔ics: require stable identity on the ICS side
        const icsSide = aIcs ? a.e : b.e;
        if (!hasStableIcsIdentity(icsSide)) continue;
      }

      if (a.dateKey !== b.dateKey) continue;

      const aStart = new Date(a.e.starts_at).getTime();
      const bStart = new Date(b.e.starts_at).getTime();
      if (!Number.isFinite(aStart) || !Number.isFinite(bStart)) continue;
      const minutes = Math.abs(aStart - bStart) / (60 * 1000);
      if (minutes > 60) continue;

      const aKey = a.dismissKey;
      const bKey = b.dismissKey;
      if (!aKey || !bKey) continue;
      if (dismissed.has(pairKey(aKey, bKey))) continue;

      const titleOverlap = overlapScore(a.titleToks, b.titleToks);
      const locOverlap = overlapScore(a.locToks, b.locToks);
      const bothLocEmpty = a.locToks.length === 0 && b.locToks.length === 0;

      // Noise guardrails
      if (titleOverlap < 0.34 && locOverlap < 0.5 && !bothLocEmpty) continue;
      if (titleOverlap < 0.5 && bothLocEmpty && a.titleToks.length <= 1 && b.titleToks.length <= 1) continue;

      let score = 0;
      const reasons: PlannerDuplicateReason[] = ["time"];
      score += 0.55 * Math.min(1, titleOverlap);
      if (titleOverlap >= 0.5) reasons.push("title");
      if (locOverlap > 0) {
        score += 0.25 * Math.min(1, locOverlap);
        if (locOverlap >= 0.5) reasons.push("location");
      } else if (bothLocEmpty) {
        score += 0.1;
      }
      if (String(a.e.team_name ?? "").trim() && String(a.e.team_name ?? "").trim() === String(b.e.team_name ?? "").trim()) {
        score += 0.05;
        reasons.push("team");
      }
      if (String(a.e.timezone ?? "").trim() && String(a.e.timezone ?? "").trim() === String(b.e.timezone ?? "").trim()) {
        score += 0.05;
        reasons.push("timezone");
      }

      const confidence: PlannerDuplicateConfidence =
        titleOverlap >= 0.7 && (locOverlap >= 0.5 || bothLocEmpty) ? "high" : "low";

      // Anchor rule: attach suggestions to the ICS event when manual↔ics,
      // otherwise attach to the event that starts earlier then id.
      const anchor =
        aIcs && !bIcs ? a.e : bIcs && !aIcs ? b.e : aStart < bStart ? a.e : aStart > bStart ? b.e : String(a.e.id) < String(b.e.id) ? a.e : b.e;
      const other = anchor.id === a.e.id ? b.e : a.e;

      const candidate: PlannerDuplicateCandidate = {
        eventId: anchor.id,
        candidateEventId: other.id,
        confidence,
        score,
        reasons: Array.from(new Set(reasons)),
      };

      const list = bestByEvent.get(candidate.eventId) ?? [];
      list.push(candidate);
      bestByEvent.set(candidate.eventId, list);
    }
  }

  for (const [eventId, list] of bestByEvent.entries()) {
    const unique = new Map<string, PlannerDuplicateCandidate>();
    for (const c of list) {
      const key = `${c.eventId}:${c.candidateEventId}`;
      const prev = unique.get(key);
      if (!prev || c.score > prev.score) unique.set(key, c);
    }
    const sorted = Array.from(unique.values()).sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence === "high" ? -1 : 1;
      return b.score - a.score;
    });
    out.push(...sorted.slice(0, 3));
  }

  return out;
}

