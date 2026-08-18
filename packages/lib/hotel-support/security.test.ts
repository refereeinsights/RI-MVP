import assert from "node:assert/strict";
import test from "node:test";

import { HOTEL_SUPPORT_TERMS_VERSION } from "./index";
import {
  HOTEL_SUPPORT_TERMS_V2_SHA256,
  hashHotelSupportToken,
  hotelSupportTermsSha256,
  hotelSupportTermsV2Sha256,
  isValidHotelSupportToken,
} from "./security";

test("accepts only a 32-byte base64url invitation token", () => {
  const token = "A".repeat(43);
  assert.equal(isValidHotelSupportToken(token), true);
  assert.equal(isValidHotelSupportToken(`${token}=`), false);
  assert.equal(isValidHotelSupportToken("short"), false);
});

test("uses fixed offline hashes for both canonical v2 rate variants", () => {
  assert.equal(hotelSupportTermsV2Sha256(500), HOTEL_SUPPORT_TERMS_V2_SHA256[500]);
  assert.equal(hotelSupportTermsV2Sha256(1000), HOTEL_SUPPORT_TERMS_V2_SHA256[1000]);
  assert.equal(HOTEL_SUPPORT_TERMS_V2_SHA256[500], "85f870fea59e35e8f42362662ea969a0ec17723ab5128994e6332b26304c96d8");
  assert.equal(HOTEL_SUPPORT_TERMS_V2_SHA256[1000], "3382fa937abc7a0d841d1766ad8d18b6250151267138846f9149516178ffaa8c");
});

test("uses SHA-256 for token and canonical terms hashing", () => {
  assert.match(hashHotelSupportToken("A".repeat(43)), /^[0-9a-f]{64}$/);
  assert.equal(hotelSupportTermsSha256(), "061b23e19d783841f3600ce7967b06545e0dc6f6d8e42435830ff09bca9fe33c");
  assert.equal(HOTEL_SUPPORT_TERMS_VERSION, "tournament_hotel_support_v1");
});
