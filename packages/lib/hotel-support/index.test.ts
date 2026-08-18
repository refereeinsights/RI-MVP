import assert from "node:assert/strict";
import test from "node:test";

import {
  HOTEL_SUPPORT_TERMS_TEXT,
  HOTEL_SUPPORT_TERMS_VERSION,
  HOTEL_SUPPORT_TERMS_VERSION_V2,
  buildHotelSupportTermsV2,
  formatHotelSupportRate,
  validateHotelSupportSubmission,
} from "./index";

const validInput = {
  contactName: "Jamie Director",
  contactEmail: " JAMIE@EXAMPLE.COM ",
  contactPhone: "555-0100",
  contactTitle: "Tournament director",
  expectedRecipientType: "tournament_organization",
  expectedRecipientName: "Example Tournament",
  confirmAuthority: true,
  confirmHousingEligibility: true,
  confirmTerms: true,
};

test("defines stable v1 Hotel Support terms", () => {
  assert.equal(HOTEL_SUPPORT_TERMS_VERSION, "tournament_hotel_support_v1");
  assert.match(HOTEL_SUPPORT_TERMS_TEXT, /does not activate fee-enabled hotel routing/i);
});

test("formats supported rates as exact dollar amounts", () => {
  assert.equal(formatHotelSupportRate(500), "$5.00 per eligible room night");
  assert.equal(formatHotelSupportRate(1000), "$10.00 per eligible room night");
});

test("builds byte-stable rate-specific v2 terms", () => {
  assert.equal(HOTEL_SUPPORT_TERMS_VERSION_V2, "tournament_hotel_support_v2");
  const fiveDollarTerms = buildHotelSupportTermsV2(500);
  const tenDollarTerms = buildHotelSupportTermsV2(1000);
  assert.match(fiveDollarTerms, /generate \$5\.00 per eligible room night/);
  assert.match(tenDollarTerms, /generate \$10\.00 per eligible room night/);
  assert.match(fiveDollarTerms, /payment timing are not guaranteed/);
  assert.match(fiveDollarTerms, /successfully attributed to and validated through TournamentInsights/);
  assert.equal(fiveDollarTerms.endsWith("\n"), false);
  assert.equal(fiveDollarTerms.split("\n\n").length, 8);
});

test("normalizes a valid submission", () => {
  const result = validateHotelSupportSubmission(validInput);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.contactEmail, "jamie@example.com");
});

test("requires every confirmation", () => {
  const result = validateHotelSupportSubmission({ ...validInput, confirmTerms: false });
  assert.deepEqual(result, { ok: false, message: "Complete every required confirmation before submitting." });
});

test("rejects invalid recipient and oversized fields", () => {
  assert.equal(validateHotelSupportSubmission({ ...validInput, expectedRecipientType: "bank" }).ok, false);
  assert.equal(validateHotelSupportSubmission({ ...validInput, expectedRecipientType: "individual" }).ok, false);
  assert.equal(validateHotelSupportSubmission({ ...validInput, contactTitle: "x".repeat(121) }).ok, false);
});
