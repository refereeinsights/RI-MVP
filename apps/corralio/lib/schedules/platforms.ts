export const SCHEDULE_PLATFORM_KEYS = [
  "gamechanger",
  "teamsnap",
  "stack_team_app",
  "arbiterlive",
  "arbiter_officials",
  "other",
] as const;

export type SchedulePlatformKey = (typeof SCHEDULE_PLATFORM_KEYS)[number];
export type ScheduleCompatibilityTier = "VERIFIED" | "COMPATIBLE" | "MANUAL" | "DIRECT_INTEGRATION";

export type SchedulePlatform = {
  key: SchedulePlatformKey;
  name: string;
  recognition: string | null;
  tier: ScheduleCompatibilityTier;
  instructions: readonly string[];
  caveat: string | null;
};

export const SCHEDULE_PLATFORM_CATALOG_VERSION = "corralio-schedule-platforms-v2";

export const SCHEDULE_PLATFORMS: readonly SchedulePlatform[] = [
  {
    key: "gamechanger",
    name: "GameChanger",
    recognition: null,
    tier: "COMPATIBLE",
    instructions: [
      "Open your team’s schedule in GameChanger.",
      "Find its calendar subscribe or export option and copy the calendar link.",
      "Return here and paste that link below.",
    ],
    caveat: null,
  },
  {
    key: "teamsnap",
    name: "TeamSnap",
    recognition: null,
    tier: "COMPATIBLE",
    instructions: [
      "Open your team’s Schedule in TeamSnap.",
      "Choose the calendar subscribe or export option and copy the web calendar link.",
      "Return here and paste that link below.",
    ],
    caveat: "If an imported event appears at midnight, confirm its time in TeamSnap.",
  },
  {
    key: "stack_team_app",
    name: "Stack Team App",
    recognition: "Also called Sports Connect",
    tier: "COMPATIBLE",
    instructions: [
      "Open your team’s Events or Schedule in Stack Team App.",
      "Choose its calendar subscription option and copy the calendar link.",
      "Return here and paste that link below.",
    ],
    caveat: null,
  },
  {
    key: "arbiterlive",
    name: "ArbiterLive",
    recognition: "For school team schedules",
    tier: "COMPATIBLE",
    instructions: [
      "Sign in to ArbiterLive, or create a free account.",
      "Find the school and team, then choose Follow.",
      "Set Role to Parent, select Email me the iCal link, and choose Subscribe.",
      "Check your email after a minute or two and copy the calendar link.",
      "Return here and paste that link below.",
    ],
    caveat: "ArbiterLive emails your calendar link rather than showing it on screen — check your inbox a minute or two after subscribing.",
  },
  {
    key: "arbiter_officials",
    name: "Arbiter (Officials)",
    recognition: "For officials — syncs your own accepted game assignments",
    tier: "COMPATIBLE",
    instructions: [
      "Sign in to ArbiterSports.",
      "Choose Settings, then Preferences.",
      "Under Calendar Sync, choose Send Email.",
      "Check your email for the iCal link ArbiterSports sends.",
      "Return here and paste that link below.",
    ],
    caveat: "This connects your own officiating assignments. We haven’t yet confirmed how ArbiterSports reports declined, reassigned, or canceled games in this feed. Until that’s verified, double-check any important change directly in ArbiterSports.",
  },
  {
    key: "other",
    name: "Other calendar",
    recognition: null,
    tier: "MANUAL",
    instructions: [
      "Open the app or website where your team schedule lives.",
      "Look for Subscribe, Export calendar, iCal, ICS, or webcal and copy that link.",
      "Return here and paste the public calendar link below.",
    ],
    caveat: "Corralio can connect a standard public iCal, ICS, or webcal subscription link.",
  },
] as const;

export function parseSchedulePlatform(value: unknown): SchedulePlatformKey | null {
  return SCHEDULE_PLATFORM_KEYS.includes(value as SchedulePlatformKey)
    ? value as SchedulePlatformKey
    : null;
}

export function getSchedulePlatform(key: SchedulePlatformKey): SchedulePlatform {
  return SCHEDULE_PLATFORMS.find((platform) => platform.key === key) as SchedulePlatform;
}
