import { createHash } from "node:crypto";

import {
  HOTEL_SUPPORT_TERMS_TEXT,
  buildHotelSupportTermsV2,
  type HotelSupportRateCents,
} from "./index";

const HOTEL_SUPPORT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const HOTEL_SUPPORT_TERMS_V2_SHA256 = {
  500: "85f870fea59e35e8f42362662ea969a0ec17723ab5128994e6332b26304c96d8",
  1000: "3382fa937abc7a0d841d1766ad8d18b6250151267138846f9149516178ffaa8c",
} as const satisfies Record<HotelSupportRateCents, string>;

export function isValidHotelSupportToken(token: string) {
  return HOTEL_SUPPORT_TOKEN_PATTERN.test(token);
}

export function hashHotelSupportToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hotelSupportTermsSha256() {
  return createHash("sha256").update(HOTEL_SUPPORT_TERMS_TEXT, "utf8").digest("hex");
}

export function hotelSupportTermsV2Sha256(rateCents: HotelSupportRateCents) {
  return createHash("sha256").update(buildHotelSupportTermsV2(rateCents), "utf8").digest("hex");
}
