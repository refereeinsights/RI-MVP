import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { parseMetadata, extractDateGuess, extractCityStateGuess, extractHostOrg } from "../pasteUrl";

const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "sample.html"), "utf8");

test("parseMetadata extracts basic fields", () => {
  const meta = parseMetadata(fixture);
  assert.strictEqual(meta.name, "Sample Winter Classic");
  assert.strictEqual(meta.summary, "This is a sample tournament description.");
  assert.strictEqual(meta.start_date, "2026-01-10");
  assert.strictEqual(meta.end_date, "2026-01-12");
  assert.strictEqual(meta.city, "Seattle");
  assert.strictEqual(meta.state, "WA");
  assert.strictEqual(meta.host_org, "Sample SC");
  assert.strictEqual(meta.image_url, "https://example.com/logo.png");
});

test("extractDateGuess handles single date", () => {
  const { start, end } = extractDateGuess("Event on Feb 5, 2026 in Portland, OR");
  assert.strictEqual(start, "2026-02-05");
  assert.strictEqual(end, "2026-02-05");
});

test("extractCityStateGuess finds city/state", () => {
  const res = extractCityStateGuess("Join us in Portland, OR for games");
  assert.deepStrictEqual(res, { city: "Portland", state: "OR" });
});

test("extractHostOrg finds host strings", () => {
  const host = extractHostOrg("Hosted by Best Club FC");
  assert.strictEqual(host, "Best Club FC");
});
