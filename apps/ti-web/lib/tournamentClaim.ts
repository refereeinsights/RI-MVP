export function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function canEditTournament(userEmail: string | null | undefined, tournamentDirectorEmail: string | null | undefined) {
  const a = normalizeEmail(userEmail);
  const b = normalizeEmail(tournamentDirectorEmail);
  if (!a || !b) return false;
  return a === b;
}

