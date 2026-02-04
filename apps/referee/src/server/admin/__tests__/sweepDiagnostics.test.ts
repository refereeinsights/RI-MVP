import { test } from "node:test";
import assert from "node:assert";
import {
  SweepError,
  classifyHtmlPayload,
  httpErrorCode,
} from "../sweepDiagnostics";

test("classifies 403 as http_error_403", () => {
  assert.strictEqual(httpErrorCode(403), "http_error_403");
});

test("classifies non-html responses", () => {
  assert.strictEqual(classifyHtmlPayload("application/pdf", 5000), "non_html_response");
});

test("classifies empty html responses", () => {
  assert.strictEqual(classifyHtmlPayload("text/html; charset=UTF-8", 512), "empty_html");
});

test("redirect loop can be represented as redirect_blocked", () => {
  const err = new SweepError("redirect_blocked", "Too many redirects");
  assert.strictEqual(err.code, "redirect_blocked");
});

test("extractor no-events and fetch failures are distinct codes", () => {
  const noEvents = new SweepError("html_received_no_events", "No events found");
  const fetchFailed = new SweepError("fetch_failed", "Request failed");
  assert.strictEqual(noEvents.code, "html_received_no_events");
  assert.strictEqual(fetchFailed.code, "fetch_failed");
});
