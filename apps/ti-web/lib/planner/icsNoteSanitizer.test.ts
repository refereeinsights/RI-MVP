import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeIcsNotesForDisplay, sanitizeImportedNotesText } from "./icsNoteSanitizer";

test("sanitizeImportedNotesText strips Link url noise", () => {
  const raw = "Link: https://example.com/feed?token=abc123";
  assert.equal(sanitizeImportedNotesText(raw), null);
});

test("sanitizeImportedNotesText strips raw tokenized URLs", () => {
  const raw = "Bring jersey https://teamsnap.com/event/abc?token=abcde";
  assert.equal(sanitizeImportedNotesText(raw), "Bring jersey");
});

test("sanitizeImportedNotesText strips uuid-like tokens", () => {
  const raw = "Note uuid=deadbeef-aaaa-4bbb-8ccc-1234567890ab";
  assert.equal(sanitizeImportedNotesText(raw), "Note uuid=");
});

test("sanitizeImportedNotesText preserves useful text while stripping suffix noise", () => {
  const raw = "Arrive 40 minutes early https://example.com/event abcdef0123456789abcdef0123456789";
  assert.equal(sanitizeImportedNotesText(raw), "Arrive 40 minutes early");
});

test("sanitizeImportedNotesText preserves harmless plain text", () => {
  const raw = "Created by TournamentInsights Weekend Planner feed UAT automation";
  assert.equal(sanitizeImportedNotesText(raw), raw);
});

test("sanitizeIcsNotesForDisplay returns normalized text for non-ics notes", () => {
  const raw = "  Plain   manual   note  ";
  assert.equal(sanitizeIcsNotesForDisplay(raw, "manual"), "Plain manual note");
});

