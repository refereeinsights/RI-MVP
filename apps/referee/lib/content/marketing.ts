import { withAmazonTag } from "@/lib/amazon";

const FOX40_URL = "https://amzn.to/4alCmZQ";
const FOX40_ASIN = "B07TSL4498";

export type AdPlacement = "home_footer_banner" | "tournaments_sidebar" | "tournament_detail_mid";

export interface AdCreative {
  id: AdPlacement;
  eyebrow?: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  background?: string;
  asin?: string;
  imageUrl?: string;
  imageAlt?: string;
}

type AdCreativeRotation = AdCreative | AdCreative[];

export type ReferralPlacement =
  | "home_referral"
  | "tournament_referral"
  | "signup_success_referral";

export interface ReferralCreative {
  id: ReferralPlacement;
  eyebrow?: string;
  title: string;
  body: string;
  highlights?: string[];
  ctaLabel: string;
  href: string;
  copyHint?: string;
}

export const AD_PLACEMENTS: Record<AdPlacement, AdCreativeRotation> = {
  home_footer_banner: [
    {
      id: "home_footer_banner",
      eyebrow: "Gear pick",
      title: "Tournament whistles, vetted",
      body: "See two Fox 40 staples refs pack for soccer weekends.",
      ctaLabel: "View whistle details",
      href: FOX40_URL,
      background: "#0b2f23",
      asin: FOX40_ASIN,
    },
    {
      id: "home_footer_banner",
      eyebrow: "Gear pick",
      title: "Uniform refresh",
      body: "Short and long sleeve kits plus shorts and socks—verify colors and stock up.",
      ctaLabel: "View uniform details",
      href: withAmazonTag("https://www.amazon.com/dp/B07Z8K7Y6M"),
      background: "#0b2f23",
      asin: "B07Z8K7Y6M",
    },
    {
      id: "home_footer_banner",
      eyebrow: "Gear pick",
      title: "Assistant flags & case",
      body: "Durable flag set plus carry case refs rely on for tight lines.",
      ctaLabel: "View flag kit details",
      href: withAmazonTag("https://www.amazon.com/Great-Call-Athletics-Assistant-Linesman/dp/B0C4V3W3F1"),
      background: "#0b2f23",
      asin: "B0C4V3W3F1",
    },
    {
      id: "home_footer_banner",
      eyebrow: "Gear pick",
      title: "Cards & match notes",
      body: "Wallet, notebook, and coin to keep your match control kit tidy.",
      ctaLabel: "View wallet details",
      href: withAmazonTag("https://www.amazon.com/dp/B01N5Q9Z8A"),
      background: "#0b2f23",
      asin: "B01N5Q9Z8A",
    },
  ],
  tournaments_sidebar: [
    {
      id: "tournaments_sidebar",
      eyebrow: "Gear tip",
      title: "Whistles refs actually use",
      body: "Classic Fox 40 picks to keep your kit consistent.",
      ctaLabel: "View whistle details",
      href: FOX40_URL,
      background: "#10291f",
      asin: FOX40_ASIN,
    },
    {
      id: "tournaments_sidebar",
      eyebrow: "Gear tip",
      title: "Uniform basics restocked",
      body: "Pro shirts, shorts, and socks so you always have the right color combo.",
      ctaLabel: "View uniform details",
      href: withAmazonTag("https://www.amazon.com/dp/B07Z8K7Y6M"),
      background: "#10291f",
      asin: "B07Z8K7Y6M",
    },
    {
      id: "tournaments_sidebar",
      eyebrow: "Gear tip",
      title: "Touchline-ready flags",
      body: "Flag set and carry case so AR kits stay sharp all weekend.",
      ctaLabel: "View flag kit details",
      href: withAmazonTag("https://www.amazon.com/Great-Call-Athletics-Assistant-Linesman/dp/B0C4V3W3F1"),
      background: "#10291f",
      asin: "B0C4V3W3F1",
    },
    {
      id: "tournaments_sidebar",
      eyebrow: "Gear tip",
      title: "Cards & toss coins",
      body: "Restock wallets, notebooks, and accessories before your next slate.",
      ctaLabel: "View wallet details",
      href: withAmazonTag("https://www.amazon.com/dp/B01N5Q9Z8A"),
      background: "#10291f",
      asin: "B01N5Q9Z8A",
    },
  ],
  tournament_detail_mid: [
    {
      id: "tournament_detail_mid",
      eyebrow: "Pack smarter",
      title: "Need a spare whistle?",
      body: "Fox 40 Classic and Pearl listed neutrally so you can restock fast ahead of kickoff.",
      ctaLabel: "View whistle details",
      href: FOX40_URL,
      background: "#1b3528",
      asin: FOX40_ASIN,
    },
    {
      id: "tournament_detail_mid",
      eyebrow: "Pack smarter",
      title: "Uniform set dialed in",
      body: "Short/long sleeve tops, shorts, and socks listed neutrally for match prep.",
      ctaLabel: "View uniform details",
      href: withAmazonTag("https://www.amazon.com/dp/B07Z8K7Y6M"),
      background: "#1b3528",
      asin: "B07Z8K7Y6M",
    },
    {
      id: "tournament_detail_mid",
      eyebrow: "Pack smarter",
      title: "Assistant ref flag set",
      body: "Line-ready flags plus protective case to survive doubleheaders.",
      ctaLabel: "View flag kit details",
      href: withAmazonTag("https://www.amazon.com/Great-Call-Athletics-Assistant-Linesman/dp/B0C4V3W3F1"),
      background: "#1b3528",
      asin: "B0C4V3W3F1",
    },
    {
      id: "tournament_detail_mid",
      eyebrow: "Pack smarter",
      title: "Cards & match wallet",
      body: "Red/yellow wallet, notes, and coin for match day routines.",
      ctaLabel: "View wallet details",
      href: withAmazonTag("https://www.amazon.com/dp/B01N5Q9Z8A"),
      background: "#1b3528",
      asin: "B01N5Q9Z8A",
    },
  ],
};

export const REFERRAL_PLACEMENTS: Record<ReferralPlacement, ReferralCreative> = {
  home_referral: {
    id: "home_referral",
    eyebrow: "Referral program",
    title: "Invite refs, unlock early features",
    body: "Invite trusted officials to join Referee Insights and help grow the community.",
    highlights: ["Unique invite link", "Track referrals on your Referrals page", "Beta rewards and badges are rolling out"],
    ctaLabel: "Get your link",
    href: "/referrals",
    copyHint: "Share anywhere—text, email, crew chats.",
  },
  tournament_referral: {
    id: "tournament_referral",
    eyebrow: "Help the crew",
    title: "Know a ref working this event?",
    body: "Invite them to leave an honest review after the weekend and keep the assignments transparent.",
    highlights: ["Takes 2 minutes", "Anonymous feedback", "Helps future crews"],
    ctaLabel: "Invite a ref to review",
    // Send to invite form so we can track who invited.
    href: "/invites/new",
  },
  signup_success_referral: {
    id: "signup_success_referral",
    eyebrow: "Next step",
    title: "Skip the wait—refer teammates",
    body: "Share your link with partners and grow the referee network together.",
    highlights: ["Unique invite link", "Track referrals on your Referrals page", "Beta rewards and badges are rolling out"],
    ctaLabel: "Share invite",
    href: "/referrals",
    copyHint: "We’ll email your unique link once you confirm your address.",
  },
};
