type FamilyColorToken = {
  main: string;
  soft: string;
  text: string;
  border: string;
};

const FAMILY_COLOR_PALETTE: FamilyColorToken[] = [
  { main: "#166534", soft: "#dcfce7", text: "#166534", border: "#86efac" },
  { main: "#1d4ed8", soft: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
  { main: "#b45309", soft: "#fef3c7", text: "#b45309", border: "#fcd34d" },
  { main: "#7c3aed", soft: "#ede9fe", text: "#6d28d9", border: "#c4b5fd" },
  { main: "#be185d", soft: "#fce7f3", text: "#be185d", border: "#f9a8d4" },
  { main: "#0f766e", soft: "#ccfbf1", text: "#0f766e", border: "#99f6e4" },
];

const UNASSIGNED_COLOR: FamilyColorToken = {
  main: "#6b7280",
  soft: "#f3f4f6",
  text: "#374151",
  border: "#d1d5db",
};

export function getFamilyColorToken(childProfileId: string | null | undefined, orderedChildIds: string[]) {
  const normalizedChildId = String(childProfileId ?? "").trim();
  if (!normalizedChildId) return UNASSIGNED_COLOR;
  const index = orderedChildIds.findIndex((childId) => String(childId) === normalizedChildId);
  if (index < 0) return UNASSIGNED_COLOR;
  return FAMILY_COLOR_PALETTE[index % FAMILY_COLOR_PALETTE.length] ?? UNASSIGNED_COLOR;
}

export function getUnassignedFamilyColorToken() {
  return UNASSIGNED_COLOR;
}
