import assert from "node:assert/strict";
import test from "node:test";

import { fetchIcsSchedule, isPrivateScheduleIp, validateScheduleUrl } from "./server";

const PUBLIC_LOOKUP = async () => [{ address: "203.0.113.20" }];
const ICS_TEXT = "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR";

function response(body: string, init?: ResponseInit) {
  return new Response(body, init);
}

test("rejects local, private, credentialed, and non-HTTP schedule URLs", () => {
  for (const value of [
    "http://localhost/calendar.ics",
    "http://calendar.local/feed.ics",
    "http://127.0.0.1/feed.ics",
    "http://10.2.3.4/feed.ics",
    "http://[::1]/feed.ics",
  ]) {
    assert.deepEqual(validateScheduleUrl(value), { ok: false, error: "private_url" });
  }
  assert.deepEqual(validateScheduleUrl("file:///tmp/feed.ics"), { ok: false, error: "unsupported_protocol" });
  assert.deepEqual(validateScheduleUrl("https://user:pass@example.com/feed.ics"), {
    ok: false,
    error: "invalid_url",
  });
  assert.equal(isPrivateScheduleIp("::ffff:127.0.0.1"), true);
});

test("rejects the Slice 4.2A unsupported-protocol fixture before DNS or fetch", async () => {
  let lookupCalls = 0;
  let fetchCalls = 0;
  const result = await fetchIcsSchedule("ftp://slice42a.invalid/synthetic.ics", {
    lookupHost: async () => {
      lookupCalls += 1;
      return [{ address: "203.0.113.20" }];
    },
    fetchImpl: (async () => {
      fetchCalls += 1;
      return response(ICS_TEXT);
    }) as typeof fetch,
  });

  assert.deepEqual(result, { ok: false, error: "unsupported_protocol" });
  assert.equal(lookupCalls, 0);
  assert.equal(fetchCalls, 0);
});

test("rejects a hostname when DNS resolves any address to a private network", async () => {
  const result = await fetchIcsSchedule("https://example.com/feed.ics", {
    lookupHost: async () => [{ address: "203.0.113.20" }, { address: "192.168.1.2" }],
    fetchImpl: (async () => response(ICS_TEXT, { headers: { "content-type": "text/calendar" } })) as typeof fetch,
  });
  assert.deepEqual(result, { ok: false, error: "private_url" });
});

test("revalidates redirects and rejects a redirect to a private target", async () => {
  const result = await fetchIcsSchedule("https://example.com/feed.ics", {
    lookupHost: PUBLIC_LOOKUP,
    fetchImpl: (async () =>
      response("", { status: 302, headers: { location: "http://127.0.0.1/private.ics" } })) as typeof fetch,
  });
  assert.deepEqual(result, { ok: false, error: "private_url" });
});

test("stops after the redirect limit", async () => {
  let calls = 0;
  const result = await fetchIcsSchedule("https://example.com/0.ics", {
    lookupHost: PUBLIC_LOOKUP,
    maxRedirects: 2,
    fetchImpl: (async () => {
      calls += 1;
      return response("", { status: 302, headers: { location: `https://example.com/${calls}.ics` } });
    }) as typeof fetch,
  });
  assert.equal(calls, 3);
  assert.deepEqual(result, { ok: false, error: "fetch_failed" });
});

test("enforces timeout and response-size limits", async () => {
  const timedOut = await fetchIcsSchedule("https://example.com/slow.ics", {
    lookupHost: PUBLIC_LOOKUP,
    timeoutMs: 5,
    fetchImpl: ((_, init) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      })) as typeof fetch,
  });
  assert.deepEqual(timedOut, { ok: false, error: "fetch_failed" });

  const tooLarge = await fetchIcsSchedule("https://example.com/large.ics", {
    lookupHost: PUBLIC_LOOKUP,
    maxResponseChars: 10,
    fetchImpl: (async () => response(ICS_TEXT, { headers: { "content-type": "text/calendar" } })) as typeof fetch,
  });
  assert.deepEqual(tooLarge, { ok: false, error: "too_large" });
});

test("returns accepted calendar text and the final redirected URL", async () => {
  let calls = 0;
  const result = await fetchIcsSchedule("https://example.com/start.ics", {
    lookupHost: PUBLIC_LOOKUP,
    fetchImpl: (async () => {
      calls += 1;
      if (calls === 1) {
        return response("", { status: 302, headers: { location: "/final.ics" } });
      }
      return response(ICS_TEXT, { headers: { "content-type": "text/calendar; charset=utf-8" } });
    }) as typeof fetch,
  });
  assert.deepEqual(result, {
    ok: true,
    text: ICS_TEXT,
    finalUrl: "https://example.com/final.ics",
  });
});
