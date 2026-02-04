import { test } from "node:test";
import assert from "node:assert";
import { normalizeSourceUrl } from "../sources";

test("normalizeSourceUrl trims, adds https, strips hash, and removes www", () => {
  const { canonical, host } = normalizeSourceUrl(" https://www.Example.com/page#frag ");
  assert.strictEqual(canonical, "https://example.com/page");
  assert.strictEqual(host, "example.com");
});

test("normalizeSourceUrl strips tracking params but keeps meaningful ones", () => {
  const { canonical, host } = normalizeSourceUrl("https://Sub.Example.com/events?id=1&utm_source=foo&gclid=bar");
  assert.strictEqual(canonical, "https://sub.example.com/events?id=1");
  assert.strictEqual(host, "sub.example.com");
});
