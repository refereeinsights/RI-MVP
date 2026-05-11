type Props = {
  className?: string;
};

export function AffiliateDisclosure({ className }: Props) {
  return (
    <div
      className={className}
      style={{
        marginTop: 10,
        fontSize: 12,
        opacity: 0.85,
        lineHeight: 1.35,
      }}
    >
      This page may contain affiliate links. TournamentInsights may earn a commission if you purchase through these links, at no
      additional cost to you.
    </div>
  );
}

