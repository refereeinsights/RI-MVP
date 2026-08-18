import assert from "node:assert/strict";
import test from "node:test";

import { HOTEL_SUPPORT_TERMS_VERSION } from "./index";
import {
  hashHotelSupportToken,
  hotelSupportTermsSha256,
  isValidHotelSupportToken,
} from "./security";

test("accepts only a 32-byte base64url invitation token", () => {
  const token = "A".repeat(43);
  assert.equal(isValidHotelSupportToken(token), true);
  assert.equal(isValidHotelSupportToken(`${token}=`), false);
  assert.equal(isValidHotelSupportToken("short"), false);
});

test("uses SHA-256 for token and canonical terms hashing", () => {
  assert.match(hashHotelSupportToken("A".repeat(43)), /^[0-9a-f]{64}$/);
  assert.equal(hotelSupportTermsSha256(), "061b23e19d783841f3600ce7967b06545e0dc6f6d8e42435830ff09bca9fe33c");
  assert.equal(HOTEL_SUPPORT_TERMS_VERSION, "tournament_hotel_support_v1");
});
