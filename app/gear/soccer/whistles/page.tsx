import Link from "next/link";
import { amazonImageUrl, withAmazonTag } from "@/lib/amazon";

type WhistleItem = {
  name: string;
  description: string;
  amazonUrl: string;
  asin: string;
};

export const metadata = {
  title: "Soccer Referee Whistles | Referee Insights Gear",
  description:
    "Commonly used soccer referee whistles, listed neutrally for convenience. Clear affiliate disclosure included.",
};

function AffiliateDisclosure() {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 12,
        padding: 12,
        background: "rgba(0,0,0,0.02)",
        marginTop: 12,
        marginBottom: 18,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Affiliate Disclosure</div>
      <div style={{ lineHeight: 1.45 }}>
        Some links on this page are affiliate links. If you make a purchase, Referee Insights may earn a
        small commission at no additional cost to you.
        <br />
        Products are listed for convenience and informational purposes only. Referee Insights does not
        endorse or guarantee any product.
      </div>
    </div>
  );
}

function GearCard({ item }: { item: WhistleItem }) {
  const imageSrc = amazonImageUrl(item.asin);

  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 16,
        padding: 16,
        background: "white",
      }}
    >
      <img
        src={imageSrc}
        alt={item.name}
        style={{ width: "100%", borderRadius: 12, marginBottom: 12, objectFit: "cover" }}
        loading="lazy"
      />
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{item.name}</div>
      <div style={{ lineHeight: 1.5, marginBottom: 12, color: "rgba(0,0,0,0.75)" }}>{item.description}</div>

      <a
        href={withAmazonTag(item.amazonUrl)}
        target="_blank"
        rel="noopener noreferrer sponsored"
        style={{
          display: "inline-block",
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.15)",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        View on Amazon
      </a>
    </div>
  );
}

export default function SoccerWhistlesPage() {
  const items: WhistleItem[] = [
    {
      name: "Fox 40 Classic Pealess Whistle",
      description: "Pealess whistle commonly used by soccer referees in all weather conditions.",
      amazonUrl: "https://amzn.to/4alCmZQ",
      asin: "B07TSL4498",
    },
    {
      name: "Fox 40 Pearl Whistle",
      description: "Compact pealess whistle with a slightly different tone; preferred by some officials.",
      amazonUrl: "https://www.amazon.com/dp/B0006VQJUG",
      asin: "B0006VQJUG",
    },
  ];

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px 60px" }}>
      <nav style={{ marginBottom: 12, fontSize: 14 }}>
        <Link href="/gear" style={{ textDecoration: "none" }}>
          Gear
        </Link>{" "}
        <span style={{ opacity: 0.6 }}>/</span>{" "}
        <Link href="/gear/soccer" style={{ textDecoration: "none" }}>
          Soccer
        </Link>{" "}
        <span style={{ opacity: 0.6 }}>/</span>{" "}
        <span style={{ opacity: 0.8 }}>Whistles</span>
      </nav>

      <h1 style={{ fontSize: 32, margin: 0 }}>Soccer Referee Whistles</h1>
      <p style={{ marginTop: 10, lineHeight: 1.55, color: "rgba(0,0,0,0.75)" }}>
        Commonly used whistles for soccer referees. Choose what fits your preference and match environment.
      </p>

      <AffiliateDisclosure />

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        {items.map((item) => (
          <GearCard key={item.name} item={item} />
        ))}
      </section>

      <div style={{ marginTop: 22, fontSize: 14, color: "rgba(0,0,0,0.7)" }}>
        Tip: Keep a backup whistle in your bag.
      </div>
    </main>
  );
}
