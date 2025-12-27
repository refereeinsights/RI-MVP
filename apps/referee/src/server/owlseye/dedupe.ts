import { createHash } from "node:crypto";

export function computeAddressFingerprint(args: {
  street: string;
  city: string;
  state: string;
  zip: string;
}): string {
  const normalize = (value: string) =>
    value
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();

  const payload = [
    normalize(args.street || ""),
    normalize(args.city || ""),
    normalize(args.state || ""),
    normalize(args.zip || ""),
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}
