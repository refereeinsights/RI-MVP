import GearSportTemplate, { type GearSection } from "../GearSportTemplate";

const sections: GearSection[] = [
  {
    title: "Plate protection",
    description:
      "Tournaments rarely give you time between assignments. Gear up with lightweight protection that’s still sturdy.",
    picks: [
      {
        name: "Low-profile mask with replaceable pads",
        note: "Stays cool in July heat and fits easily into a standard backpack.",
      },
      {
        name: "Memory-foam chest protector",
        note: "Absorbs foul tips without feeling bulky when you switch to bases.",
      },
      {
        name: "Steel-toe plate shoes",
        note: "Serious protection plus enough cushioning to hustle to first when rotations change.",
      },
    ],
  },
  {
    title: "Base work staples",
    description:
      "Get out of the slot quickly with shoes and belts that handle dirt, clay, and surprise rain delays.",
    picks: [
      {
        name: "Convertible field shoes",
        note: "Swap between turf and cleat plates without carrying a second pair of shoes.",
      },
      {
        name: "Reinforced ball bags",
        note: "Dual pockets and towel loop keep everything reachable between innings.",
      },
      {
        name: "Classic indicator + brush combo",
        note: "Heavy duty metal indicator paired with a brush that won’t shed after two weekends.",
      },
    ],
  },
  {
    title: "Sun & weather management",
    description: "Multi-game slates mean long hours in the elements—pack small items that save your skin.",
    picks: [
      {
        name: "UV protective sleeves",
        note: "Match navy or black uniforms and cut down on sunburn even during 1 p.m. slots.",
      },
      {
        name: "Compact cooling towel",
        note: "Soak it in the dugout cooler and drape it under your chest protector between innings.",
      },
      {
        name: "Electrolyte powder singles",
        note: "Stash a few in your pocket for quick recovery between back-to-back plates.",
      },
    ],
  },
];

export const metadata = {
  title: "Baseball Umpire Gear Guide | Referee Insights",
  description:
    "Recommended masks, protectors, footwear, and sun management tools sourced from weekend baseball crews.",
};

export default function BaseballGearPage() {
  return (
    <GearSportTemplate
      eyebrow="Baseball gear"
      title="Baseball umpire pack list"
      subtitle="From early spring cold to midsummer heat, these umpire picks keep crews protected, comfortable, and game-ready."
      sections={sections}
    />
  );
}
