import { createHash } from "node:crypto";

import { HOTEL_SUPPORT_TERMS_TEXT } from "./index";

const HOTEL_SUPPORT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isValidHotelSupportToken(token: string) {
  return HOTEL_SUPPORT_TOKEN_PATTERN.test(token);
}

export function hashHotelSupportToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hotelSupportTermsSha256() {
  return createHash("sha256").update(HOTEL_SUPPORT_TERMS_TEXT, "utf8").digest("hex");
}
