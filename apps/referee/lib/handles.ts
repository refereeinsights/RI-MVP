const DEFAULT_PROHIBITED_TERMS = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "asshole",
  "whore",
  "slut",
  "nazi",
  "kkk",
  "whitepower",
  "white-power",
  "hitler",
  "idiot",
  "dumbass",
];

function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const envTerms =
  process.env.PROHIBITED_HANDLE_TERMS?.split(",")
    .map((term) => term.trim())
    .filter(Boolean) ?? [];

const PROHIBITED_TERMS = [...DEFAULT_PROHIBITED_TERMS, ...envTerms].map(normalizeForMatch);

export function normalizeHandle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

export function handleContainsProhibitedTerm(value: string) {
  const normalized = normalizeForMatch(value);
  if (!normalized) return false;
  return PROHIBITED_TERMS.some((term) => term && normalized.includes(term));
}

export function isHandleAllowed(value: string) {
  const normalized = normalizeHandle(value);
  if (normalized.length < 3) return false;
  return !handleContainsProhibitedTerm(normalized);
}
