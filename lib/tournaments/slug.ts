function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildTournamentSlug(args: {
  name: string;
  city?: string | null;
  state?: string | null;
  start_date?: string | null;
}): string {
  return [
    slugify(args.name),
    args.city ? slugify(args.city) : null,
    args.state ? slugify(args.state) : null,
    args.start_date ? slugify(args.start_date) : null,
  ]
    .filter(Boolean)
    .join("-");
}
