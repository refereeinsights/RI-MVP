function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function sanitizeScheduleNotes(rawNotes: string | null | undefined) {
  const raw = collapseWhitespace(String(rawNotes ?? "").trim());
  if (!raw) return null;
  const withoutUrls = raw.replace(/\b(?:https?:\/\/|www\.)[^\s"'<>]+/gi, " ");
  const withoutUuid = withoutUrls.replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, " ");
  const withoutHexDigest = withoutUuid.replace(/\b[0-9a-f]{32}\b/gi, " ");
  const withoutStructuredArtifacts = withoutHexDigest.replace(
    /\b(?:Game|Practice|Location|Duration|Link)\s*:\s*.*?(?=\s+\b(?:Game|Practice|Location|Duration|Arrival|Uniform|Link)\s*:|$)/gi,
    " ",
  );
  const withoutPunctuationGaps = withoutStructuredArtifacts.replace(/\s+([.,;:!?])/g, "$1");
  return collapseWhitespace(withoutPunctuationGaps) || null;
}
