import GearSportTemplate, { type GearSection } from "../GearSportTemplate";

const sections: GearSection[] = [
  {
    title: "Court-ready uniforms",
    description:
      "Breathable stripes and pants that transition from youth rec gyms to showcase events without wrinkling.",
    picks: [
      { name: "Lightweight V-neck jersey", note: "Mesh back panel keeps airflow moving during full-court presses." },
      { name: "Travel-friendly slacks", note: "Stretch fabric with zip ankles so you can change without removing shoes." },
      { name: "Crew socks with targeted cushioning", note: "Arches stay supported when you’re trail for the third straight game." },
    ],
  },
  {
    title: "Shoes & floor grip",
    description:
      "Stop-start footwork beats up your knees—these picks focus on cushioning and traction inside dusty fieldhouses.",
    picks: [
      {
        name: "Responsive low-top trainers",
        note: "Neutral colors, great lateral support, and bounce for quick transitions.",
      },
      {
        name: "Grip wipes + compact mat",
        note: "Quick wipe kit fits in your pocket and restores traction between whistles.",
      },
      {
        name: "Court-friendly insoles",
        note: "Absorb shock on concrete underlay so you still feel fresh on day two.",
      },
    ],
  },
  {
    title: "Game management tools",
    description: "Streamline possession tracking and keep voices calm during heated AAU matchups.",
    picks: [
      {
        name: "Dual-tone whistle with lanyard backup",
        note: "Carry a spare so you never delay a live-ball situation.",
      },
      {
        name: "Digital possession arrow clip",
        note: "Snaps to your waistband and glows in dim gyms.",
      },
      {
        name: "Pocket-sized deodorizing spray",
        note: "Helps when you barely have time between games but want a quick reset.",
      },
    ],
  },
];

export const metadata = {
  title: "Basketball Referee Gear Guide | Referee Insights",
  description:
    "Recommended basketball officiating uniforms, shoes, and tools sourced from active crews working weekend tournaments.",
};

export default function BasketballGearPage() {
  return (
    <GearSportTemplate
      eyebrow="Basketball gear"
      title="Basketball referee essentials"
      subtitle="Pack once, work five games. These officiating picks prioritize breathability, traction, and professional presentation for any tournament bracket."
      sections={sections}
    />
  );
}
