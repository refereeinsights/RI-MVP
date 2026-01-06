import { test } from "node:test";
import assert from "node:assert";
import { normalizeSourceUrl } from "../sources";

test("normalizeSourceUrl trims and adds https", () => {
  const { canonical, host } = normalizeSourceUrl("example.com/page#frag ");
  assert.strictEqual(canonical, "https://example.com/page");
  assert.strictEqual(host, "example.com");
});

test("normalizeSourceUrl keeps https and strips hash", () => {
  const { canonical, host } = normalizeSourceUrl("https://Sub.Example.com/events?id=1#section");
  assert.strictEqual(canonical, "https://sub.example.com/events?id=1");
  assert.strictEqual(host, "sub.example.com");
});
