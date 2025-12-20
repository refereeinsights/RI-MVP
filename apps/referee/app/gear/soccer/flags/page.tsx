import Link from "next/link";
import { withAmazonTag } from "@/lib/amazon";

function AffiliateDisclosure() {
  return (
    <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12, margin: "16px 0" }}>
      <strong>Affiliate Disclosure</strong>
      <p style={{ marginTop: 6 }}>
        Some links on this page are affiliate links. Referee Insights may earn a small commission at no additional cost
        to you. Products are listed for informational purposes only.
      </p>
    </div>
  );
}

type FlagItem = {
  name: string;
  description: string;
  url: string;
};

const items: FlagItem[] = [
  {
    name: "Assistant Referee Flag Set (Soccer)",
    description: "Two-flag set commonly used by assistant referees during matches.",
    url: "https://www.amazon.com/Great-Call-Athletics-Assistant-Linesman/dp/B0C4V3W3F1",
  },
  {
    name: "Assistant Referee Flag Carry Case",
    description: "Protective case for storing and transporting referee flags.",
    url: "https://www.amazon.com/KESYOO-Carrying-Football-Volleyball-Competitions/dp/B0F331H45S",
  },
];

export default function SoccerFlagsPage() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <nav style={{ fontSize: 14, marginBottom: 12 }}>
        <Link href="/gear">Gear</Link> / <Link href="/gear/soccer">Soccer</Link> / Flags
      </nav>

      <h1>Assistant Referee Flags</h1>
      <p>Commonly used flags and accessories for assistant referees.</p>

      <AffiliateDisclosure />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {items.map((item) => (
          <div key={item.name} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <a href={withAmazonTag(item.url)} target="_blank" rel="noopener noreferrer sponsored">
              View on Amazon
            </a>
          </div>
        ))}
      </div>
    </main>
  );
}
