export type FamilyColorToken = {
  main: string;
  soft: string;
  text: string;
  border: string;
};

export const FAMILY_COLOR_OPTIONS = [
  { key: "forest", label: "Forest", token: { main: "#166534", soft: "#dcfce7", text: "#166534", border: "#86efac" } },
  { key: "ocean", label: "Ocean", token: { main: "#1d4ed8", soft: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" } },
  { key: "amber", label: "Amber", token: { main: "#b45309", soft: "#fef3c7", text: "#b45309", border: "#fcd34d" } },
  { key: "violet", label: "Violet", token: { main: "#7c3aed", soft: "#ede9fe", text: "#6d28d9", border: "#c4b5fd" } },
  { key: "rose", label: "Rose", token: { main: "#be185d", soft: "#fce7f3", text: "#be185d", border: "#f9a8d4" } },
  { key: "teal", label: "Teal", token: { main: "#0f766e", soft: "#ccfbf1", text: "#0f766e", border: "#99f6e4" } },
] as const satisfies ReadonlyArray<{ key: string; label: string; token: FamilyColorToken }>;

const FAMILY_COLOR_BY_KEY = new Map<string, FamilyColorToken>(
  FAMILY_COLOR_OPTIONS.map((option) => [option.key, option.token])
);

const FAMILY_COLOR_PALETTE: FamilyColorToken[] = FAMILY_COLOR_OPTIONS.map((option) => option.token);

export type FamilyColorOptionKey = (typeof FAMILY_COLOR_OPTIONS)[number]["key"];

export function isValidFamilyColorOption(value: unknown): value is FamilyColorOptionKey {
  const normalized = String(value ?? "").trim();
  return FAMILY_COLOR_BY_KEY.has(normalized);
}

export function familyColorFromKey(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return FAMILY_COLOR_BY_KEY.get(normalized) ?? null;
}

export function compactAssignmentLabel(childName: string | null | undefined, teamName: string | null | undefined) {
  const normalizedChildName = String(childName ?? "").trim();
  if (!normalizedChildName) return null;
  const normalizedTeamName = String(teamName ?? "").trim();
  if (!normalizedTeamName) return normalizedChildName;

  const simplifiedTeamName = simplifyTeamNameForBadge(normalizedTeamName, normalizedChildName);
  return simplifiedTeamName ? `${normalizedChildName} · ${simplifiedTeamName}` : normalizedChildName;
}

function simplifyTeamNameForBadge(teamName: string, childName: string) {
  const normalizedTeamName = teamName.trim();
  const normalizedChildName = childName.trim();
  if (!normalizedTeamName || !normalizedChildName) return normalizedTeamName;

  const lowerChildName = normalizedChildName.toLowerCase();
  const separatorMatch = normalizedTeamName.match(/[-–·]/);
  if (separatorMatch) {
    const separator = separatorMatch[0];
    const parts = normalizedTeamName
      .split(separator)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2 && parts[0]?.toLowerCase().includes(lowerChildName)) {
      return parts[parts.length - 1] ?? normalizedTeamName;
    }
  }

  if (normalizedTeamName.toLowerCase().startsWith(lowerChildName)) {
    const stripped = normalizedTeamName.slice(normalizedChildName.length).replace(/^[\s\-–·|:]+/, "").trim();
    if (stripped) return stripped;
  }

  return normalizedTeamName;
}

const UNASSIGNED_COLOR: FamilyColorToken = {
  main: "#6b7280",
  soft: "#f3f4f6",
  text: "#374151",
  border: "#d1d5db",
};

export function getFamilyColorToken(
  childProfileId: string | null | undefined,
  orderedChildIds: string[],
  explicitColorKey?: string | null
) {
  const selectedToken = familyColorFromKey(explicitColorKey);
  if (selectedToken) return selectedToken;

  const normalizedChildId = String(childProfileId ?? "").trim();
  if (!normalizedChildId) return UNASSIGNED_COLOR;
  const index = orderedChildIds.findIndex((childId) => String(childId) === normalizedChildId);
  if (index < 0) return UNASSIGNED_COLOR;
  return FAMILY_COLOR_PALETTE[index % FAMILY_COLOR_PALETTE.length] ?? UNASSIGNED_COLOR;
}

export function getUnassignedFamilyColorToken() {
  return UNASSIGNED_COLOR;
}
