import Link from "next/link";
import { withAmazonTag } from "@/lib/amazon";

type UniformItem = {
  name: string;
  description: string;
  url: string;
};

const items: UniformItem[] = [
  {
    name: "Short Sleeve Soccer Referee Jersey",
    description: "Short sleeve referee jersey suitable for match use. Verify league color requirements.",
    url: "https://www.amazon.com/dp/B07Z8K7Y6M",
  },
  {
    name: "Long Sleeve Soccer Referee Jersey",
    description: "Long sleeve referee jersey for cooler weather matches.",
    url: "https://www.amazon.com/dp/B07Z8M2Y5K",
  },
  {
    name: "Referee Shorts (Black)",
    description: "Black referee shorts with pockets designed for match use.",
    url: "https://www.amazon.com/dp/B07Z8KJY8F",
  },
  {
    name: "Referee Socks (Black)",
    description: "Knee-high referee socks commonly worn with official uniforms.",
    url: "https://www.amazon.com/dp/B07Z8L4X9H",
  },
];

export default function SoccerUniformsPage() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <nav style={{ fontSize: 14, marginBottom: 12 }}>
        <Link href="/gear">Gear</Link> / <Link href="/gear/soccer">Soccer</Link> / Uniforms
      </nav>

      <h1>Soccer Referee Uniforms</h1>
      <p>Commonly used uniforms and apparel. Always confirm league requirements.</p>

      <div style={{ display: "grid", gap: 16 }}>
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
