export function makeVenueSlug(name: string | null | undefined, city?: string | null, state?: string | null): string {
  const parts = [name ?? "", city ?? "", state ?? ""]
    .map((p) =>
      (p || "")
        .replace(/'/g, "")
        .replace(/&/g, " and ")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    )
    .filter(Boolean);
  const base = parts.join("-") || "venue";
  return base;
}
