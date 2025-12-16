export type AdPlacement = "home_footer_banner" | "tournaments_sidebar" | "tournament_detail_mid";

export interface AdCreative {
  id: AdPlacement;
  eyebrow?: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  background?: string;
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
      body: "See two Fox 40 staples refs pack for soccer weekends plus disclosure details.",
      ctaLabel: "View whistle guide",
      href: "/gear/soccer/whistles",
      background: "#0b2f23",
    },
    {
      id: "home_footer_banner",
      eyebrow: "Gear pick",
      title: "Uniform refresh",
      body: "Short and long sleeve kits plus shorts and socks—verify colors and stock up.",
      ctaLabel: "Browse uniforms",
      href: "/gear/soccer/uniforms",
      background: "#0b2f23",
    },
    {
      id: "home_footer_banner",
      eyebrow: "Gear pick",
      title: "Assistant flags & case",
      body: "Grab a durable flag set plus carry case refs rely on for tight lines.",
      ctaLabel: "Shop flags",
      href: "/gear/soccer/flags",
      background: "#0b2f23",
    },
    {
      id: "home_footer_banner",
      eyebrow: "Gear pick",
      title: "Cards & match notes",
      body: "Wallet, notebook, and coin to keep your match control kit tidy.",
      ctaLabel: "Browse cards",
      href: "/gear/soccer/cards",
      background: "#0b2f23",
    },
  ],
  tournaments_sidebar: [
    {
      id: "tournaments_sidebar",
      eyebrow: "Gear tip",
      title: "Whistles refs actually use",
      body: "Classic Fox 40 picks with affiliate disclosure—grab a backup before your next center.",
      ctaLabel: "Browse whistles",
      href: "/gear/soccer/whistles",
      background: "#10291f",
    },
    {
      id: "tournaments_sidebar",
      eyebrow: "Gear tip",
      title: "Uniform basics restocked",
      body: "Pro shirts, shorts, and socks so you always have the right color combo.",
      ctaLabel: "See uniform kit",
      href: "/gear/soccer/uniforms",
      background: "#10291f",
    },
    {
      id: "tournaments_sidebar",
      eyebrow: "Gear tip",
      title: "Touchline-ready flags",
      body: "Flag set and carry case so AR kits stay sharp all weekend.",
      ctaLabel: "View flag kit",
      href: "/gear/soccer/flags",
      background: "#10291f",
    },
    {
      id: "tournaments_sidebar",
      eyebrow: "Gear tip",
      title: "Cards & toss coins",
      body: "Restock wallets, notebooks, and accessories before your next slate.",
      ctaLabel: "See match kit",
      href: "/gear/soccer/cards",
      background: "#10291f",
    },
  ],
  tournament_detail_mid: [
    {
      id: "tournament_detail_mid",
      eyebrow: "Pack smarter",
      title: "Need a spare whistle?",
      body: "Fox 40 Classic and Pearl listed neutrally so you can restock fast ahead of kickoff.",
      ctaLabel: "See picks",
      href: "/gear/soccer/whistles",
      background: "#1b3528",
    },
    {
      id: "tournament_detail_mid",
      eyebrow: "Pack smarter",
      title: "Uniform set dialed in",
      body: "Short/long sleeve tops, shorts, and socks listed neutrally for match prep.",
      ctaLabel: "View uniforms",
      href: "/gear/soccer/uniforms",
      background: "#1b3528",
    },
    {
      id: "tournament_detail_mid",
      eyebrow: "Pack smarter",
      title: "Assistant ref flag set",
      body: "Line-ready flags plus protective case to survive doubleheaders.",
      ctaLabel: "Check flags",
      href: "/gear/soccer/flags",
      background: "#1b3528",
    },
    {
      id: "tournament_detail_mid",
      eyebrow: "Pack smarter",
      title: "Cards & match wallet",
      body: "Red/yellow wallet, notes, and coin with full affiliate disclosure.",
      ctaLabel: "Shop cards",
      href: "/gear/soccer/cards",
      background: "#1b3528",
    },
  ],
};

export const REFERRAL_PLACEMENTS: Record<ReferralPlacement, ReferralCreative> = {
  home_referral: {
    id: "home_referral",
    eyebrow: "Referral program",
    title: "Invite refs, unlock early features",
    body: "Bring three trusted officials into Referee Insights to unlock beta badges, verified waitlist priority, and early assignor intel.",
    highlights: ["Unique invite link", "Track referrals in your profile", "Priority access to new markets"],
    ctaLabel: "Get your link",
    href: "https://refereeinsights.com/referrals",
    copyHint: "Share anywhere—text, email, crew chats.",
  },
  tournament_referral: {
    id: "tournament_referral",
    eyebrow: "Help the crew",
    title: "Know a ref working this event?",
    body: "Invite them to leave an honest review after the weekend and keep the assignments transparent.",
    highlights: ["Takes 2 minutes", "Anonymous feedback", "Helps future crews"],
    ctaLabel: "Invite a ref",
    href: "https://refereeinsights.com/referrals",
  },
  signup_success_referral: {
    id: "signup_success_referral",
    eyebrow: "Next step",
    title: "Skip the wait—refer teammates",
    body: "Share your fresh account with partners. Each verified referral moves you up the queue.",
    highlights: ["Top of waitlist", "Unlock verified badge faster", "Earn limited swag"],
    ctaLabel: "Share invite",
    href: "https://refereeinsights.com/referrals",
    copyHint: "We’ll email your unique link once you confirm your address.",
  },
};
