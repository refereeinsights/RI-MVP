import Link from "next/link";
import { amazonImageUrl, withAmazonTag } from "@/lib/amazon";

type CardItem = {
  name: string;
  description: string;
  url: string;
  asin: string;
};

const items: CardItem[] = [
  {
    name: "Referee Wallet with Red & Yellow Cards",
    description: "Standard referee wallet with red and yellow cards for match control.",
    url: "https://www.amazon.com/dp/B01N5Q9Z8A",
    asin: "B01N5Q9Z8A",
  },
  {
    name: "Referee Notebook & Pencil Set",
    description: "Compact notebook set for tracking goals, cautions, and substitutions.",
    url: "https://www.amazon.com/dp/B07D7G5Q2M",
    asin: "B07D7G5Q2M",
  },
  {
    name: "Soccer Coin Toss Coin",
    description: "Metal coin designed for pre-match coin tosses.",
    url: "https://www.amazon.com/dp/B07F2YH7G9",
    asin: "B07F2YH7G9",
  },
];

export default function SoccerCardsPage() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <nav style={{ fontSize: 14, marginBottom: 12 }}>
        <Link href="/gear">Gear</Link> / <Link href="/gear/soccer">Soccer</Link> / Cards
      </nav>

      <h1>Cards & Match Accessories</h1>
      <p>Basic match management tools used by soccer referees.</p>

      <div style={{ display: "grid", gap: 16 }}>
        {items.map((item) => (
          <div key={item.name} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
            <img
              src={amazonImageUrl(item.asin)}
              alt={item.name}
              style={{ width: "100%", borderRadius: 12, marginBottom: 12, objectFit: "cover" }}
              loading="lazy"
            />
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
