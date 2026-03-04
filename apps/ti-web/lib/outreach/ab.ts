import { createHash } from "node:crypto";

export type OutreachVariant = "A" | "B";

export function pickVariant(tournamentId: string): OutreachVariant {
  const hash = createHash("sha256").update(tournamentId.trim()).digest();
  return hash[0] % 2 === 0 ? "A" : "B";
}
