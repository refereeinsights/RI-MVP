import type { ReactNode } from "react";

type Props = {
  className?: string;
  children?: ReactNode;
};

export function AffiliateDisclosure({ className, children }: Props) {
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
      {children ?? (
        <>
          This page may contain affiliate links. TournamentInsights may earn a commission if you purchase through these links, at no
          additional cost to you.
        </>
      )}
    </div>
  );
}
