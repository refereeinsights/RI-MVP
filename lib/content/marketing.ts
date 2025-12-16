export type AdPlacement =
  | "home_footer_banner"
  | "tournaments_sidebar"
  | "tournament_detail_mid";

export interface AdCreative {
  id: AdPlacement;
  eyebrow?: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  background?: string;
}

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

export const AD_PLACEMENTS: Record<AdPlacement, AdCreative> = {
  home_footer_banner: {
    id: "home_footer_banner",
    eyebrow: "Sponsored insight",
    title: "Assignors you can trust",
    body: "Partner spotlight: Cascade Cup Staffing shares pay rates ahead of time. Tap through to see open weekends.",
    ctaLabel: "View sponsor",
    href: "https://refereeinsights.com/sponsors/cascade-cup",
    background: "#0b2f23",
  },
  tournaments_sidebar: {
    id: "tournaments_sidebar",
    eyebrow: "Partner offer",
    title: "Gear up for tournament season",
    body: "Get 15% off referee kits from ProLine with code REFINSIGHTS.",
    ctaLabel: "Shop ProLine",
    href: "https://refereeinsights.com/referral/proline",
    background: "#10291f",
  },
  tournament_detail_mid: {
    id: "tournament_detail_mid",
    eyebrow: "Referral bonus",
    title: "Share insights, earn swag",
    body: "Refer fellow officials to Rate & Review and get limited edition badges.",
    ctaLabel: "Copy your link",
    href: "https://refereeinsights.com/referrals",
    background: "#1b3528",
  },
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
