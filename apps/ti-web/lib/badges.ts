export const BADGE_IMAGE_MAP: Record<string, { src: string; alt: string }> = {
  founding_referee: { src: "/founding-referee.png", alt: "Founding referee badge" },
  verified_referee: { src: "/verified-referee.png", alt: "Verified referee badge" },
  top_contributor: { src: "/top-contributor.png", alt: "Top contributor badge" },
};

export function badgeImagesForCodes(codes: (string | null | undefined)[]) {
  return codes
    .map((code) => (code ? BADGE_IMAGE_MAP[code] : null))
    .filter(Boolean) as { src: string; alt: string }[];
}
