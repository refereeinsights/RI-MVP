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
      {children ??
        "Hotel Booking Disclosure: Hotel booking is provided by HotelPlanner. TournamentInsights may receive a marketing fee for qualifying reservations. Reservations and reservation customer service are handled by HotelPlanner."}
    </div>
  );
}
