import GearSportTemplate, { type GearSection } from "../GearSportTemplate";

const sections: GearSection[] = [
  {
    title: "All-weather uniforms",
    description:
      "Friday night lights get cold fast. These layers handle rain, sleet, and late-season championships.",
    picks: [
      { name: "Water-resistant stripes jacket", note: "Meets NFHS guidelines while blocking wind on the sideline." },
      { name: "Thermal compression tights", note: "Fits under knickers without restricting sprint mechanics." },
      { name: "Sideline skull cap + gloves", note: "Keeps communication headsets dry and fingers warm for signal clarity." },
    ],
  },
  {
    title: "Field gear & accessories",
    description:
      "Markers, flags, and tools built for fast-paced snaps—no more fumbling in the rain for a bean bag.",
    picks: [
      { name: "Weighted penalty flags", note: "Bright, easy to spot on turf even in heavy wind." },
      {
        name: "Dual bean bag set",
        note: "Clips to belt and includes reflective stitching for late kickoffs.",
      },
      {
        name: "Reusable game card wallet",
        note: "Keeps microphone notes and clock adjustments dry thanks to a magnetic closure.",
      },
    ],
  },
  {
    title: "Footwear & protection",
    description: "Stay stable on slick turf while keeping knees and hips healthy through film weekends.",
    picks: [
      {
        name: "Mid-cut black turf shoes",
        note: "Neutral look, plenty of grip, and comfortable enough for chain crew double duty.",
      },
      {
        name: "Adjustable knee braces",
        note: "Low-profile braces steady plant legs without restricting mechanics.",
      },
      {
        name: "Impact-resistant belt pouch",
        note: "Holds wireless mic packs securely so they don’t bounce during sprints.",
      },
    ],
  },
];

export const metadata = {
  title: "Football Official Gear Guide | Referee Insights",
  description:
    "Weather-proof football officiating uniforms, field accessories, and supportive footwear sourced from active crews.",
};

export default function FootballGearPage() {
  return (
    <GearSportTemplate
      eyebrow="Football gear"
      title="Football official essentials"
      subtitle="Layer smart, keep your signals crisp, and stay comfortable from pregame conference through the final whistle. These picks come recommended by veteran white hats and wings."
      sections={sections}
    />
  );
}
