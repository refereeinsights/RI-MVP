import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  parseMetadata,
  extractDateGuess,
  extractCityStateGuess,
  extractHostOrg,
  parseOregonSanctionedTournaments,
} from "../pasteUrl";

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

test("parseOregonSanctionedTournaments parses linked list entries", () => {
  const html = `
    <main>
      <div class="entry-content">
        <h3>2025 - 2026 Sanctioned Tournaments</h3>
        <p>Westside Metros - <a href="https://example.com/alliance">Alliance College Showcase December 5-7, December 12-14, 2025</a></p>
        <p>Eugene Metro FC - <a href="https://example.com/3v3">EMFC 3v3 Challenge Cup - June 6, 2026</a></p>
      </div>
    </main>
  `;
  const rows = parseOregonSanctionedTournaments(html);
  assert.strictEqual(rows.length, 2);

  const alliance = rows.find((row) => row.name === "Alliance College Showcase");
  assert(alliance);
  assert.strictEqual(alliance?.state, "OR");
  assert.strictEqual(alliance?.start_date, "2025-12-05");
  assert.strictEqual(alliance?.end_date, "2025-12-14");

  const emfc = rows.find((row) => row.name === "EMFC 3v3 Challenge Cup");
  assert(emfc);
  assert.strictEqual(emfc?.start_date, "2026-06-06");
  assert.strictEqual(emfc?.end_date, "2026-06-06");
});
