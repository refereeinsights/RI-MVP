import crypto from "crypto";
import { TI_SPORTS, type TiSport } from "@/lib/tiSports";
import type { TiTier } from "@/lib/entitlements";
import { ZIP_PATTERN } from "@/lib/tiProfile";

export type AlertCadence = "weekly" | "daily";

export const ALERT_START_OFFSET_DAYS = 21;

export const ALERT_MAX_RESULTS = 10;

export type TournamentAlertRow = {
  id: string;
  user_id: string;
  name: string | null;
  zip_code: string;
  radius_miles: number;
  days_ahead: number;
  sport: string | null;
  cadence: AlertCadence;
  is_active: boolean;
  last_sent_at: string | null;
  last_result_hash: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeAlertName(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, 80) : null;
}

export function normalizeZip5(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!ZIP_PATTERN.test(raw)) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 5) return null;
  return digits.slice(0, 5);
}

export function normalizeCadence(value: unknown): AlertCadence | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "weekly") return "weekly";
  if (raw === "daily") return "daily";
  return null;
}

export function normalizeSport(value: unknown): TiSport | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const allowed = new Set<string>(TI_SPORTS.map((s) => s.toLowerCase()));
  return allowed.has(raw) ? (raw as TiSport) : null;
}

export function normalizePositiveInt(value: unknown): number | null {
  const n = Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return null;
  const int = Math.floor(n);
  return int > 0 ? int : null;
}

export function getTierCaps(tier: TiTier): {
  maxActiveAlerts: number;
  maxRadiusMiles: number;
  maxDaysAhead: number;
  allowedCadences: AlertCadence[];
} {
  if (tier === "weekend_pro") {
    return {
      maxActiveAlerts: 5,
      maxRadiusMiles: 250,
      maxDaysAhead: 60,
      allowedCadences: ["weekly", "daily"],
    };
  }

  // Insider (default for verified users)
  return {
    maxActiveAlerts: 1,
    maxRadiusMiles: 50,
    maxDaysAhead: 14,
    allowedCadences: ["weekly"],
  };
}

export function computeUtcDateString(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addUtcDays(date: Date, days: number) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function computeAlertWindowUtc(daysAhead: number): { start: string; end: string } {
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const windowStart = addUtcDays(utcToday, ALERT_START_OFFSET_DAYS);
  const windowEnd = addUtcDays(utcToday, ALERT_START_OFFSET_DAYS + daysAhead);
  return { start: computeUtcDateString(windowStart), end: computeUtcDateString(windowEnd) };
}

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8; // miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function buildResultHash(tournamentIds: string[]) {
  const stable = tournamentIds.join("|");
  return crypto.createHash("sha256").update(stable).digest("hex");
}

