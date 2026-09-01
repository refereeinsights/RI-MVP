import test from "node:test";
import assert from "node:assert/strict";
import { zipSync } from "fflate";

import {
  HOTELPLANNER_REPORT_MAX_COMPRESSED_BYTES,
  buildHotelPlannerBackfillChunks,
  fetchWithTimeout,
  inspectBoundedXlsxArchive,
  readBoundedResponse,
  validateHotelPlannerReportUrl,
} from "./hotelPlannerReportSafety";

test("allows only audited HTTPS HotelPlanner report hosts", () => {
  assert.equal(
    validateHotelPlannerReportUrl("https://hotelplanner.s3.amazonaws.com/report.xlsx?signature=secret").hostname,
    "hotelplanner.s3.amazonaws.com",
  );
  assert.throws(() => validateHotelPlannerReportUrl("http://hotelplanner.s3.amazonaws.com/report.xlsx"));
  assert.throws(() => validateHotelPlannerReportUrl("https://hotelplanner.s3.amazonaws.com.evil.invalid/report.xlsx"));
  assert.throws(() => validateHotelPlannerReportUrl("https://user:pass@hotelplanner.s3.amazonaws.com/report.xlsx"));
});

test("bounds historical backfill to 31 days, seven-day chunks, and five calls", () => {
  const chunks = buildHotelPlannerBackfillChunks("2026-08-01", "2026-08-31");
  assert.equal(chunks.length, 5);
  // chunk.end is the exclusive HP purchasedDateEnd boundary (first instant of the day
  // after the intended last day). chunk.start of each chunk equals chunk.end of the prior
  // chunk so no calendar day is lost or double-counted between adjacent chunks.
  assert.deepEqual(
    chunks.map(({ start, end }) => [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]),
    [
      ["2026-08-01", "2026-08-08"],
      ["2026-08-08", "2026-08-15"],
      ["2026-08-15", "2026-08-22"],
      ["2026-08-22", "2026-08-29"],
      ["2026-08-29", "2026-09-01"],
    ],
  );
  assert.throws(() => buildHotelPlannerBackfillChunks("2026-08-01", "2026-09-01"));
  assert.throws(() => buildHotelPlannerBackfillChunks("2026-08-02", "2026-08-01"));
});

test("backfill chunk end is an exclusive boundary that covers the full final day", () => {
  // Aug 21 boundary: confirmed omission in dry run (1 booking missed).
  // The Aug 15–21 chunk must end at Aug 22 so HP includes all of Aug 21.
  const aug = buildHotelPlannerBackfillChunks("2026-08-01", "2026-08-31");
  const chunk3 = aug[2]; // Aug 15–21
  assert.equal(chunk3.start.toISOString(), "2026-08-15T00:00:00.000Z");
  assert.equal(chunk3.end.toISOString(), "2026-08-22T00:00:00.000Z");

  // Aug 28 boundary: confirmed omission in dry run (4 bookings missed).
  const chunk4 = aug[3]; // Aug 22–28
  assert.equal(chunk4.start.toISOString(), "2026-08-22T00:00:00.000Z");
  assert.equal(chunk4.end.toISOString(), "2026-08-29T00:00:00.000Z");

  // Aug 31 boundary: final day of the requested range must also be covered.
  const chunk5 = aug[4]; // Aug 29–31
  assert.equal(chunk5.start.toISOString(), "2026-08-29T00:00:00.000Z");
  assert.equal(chunk5.end.toISOString(), "2026-09-01T00:00:00.000Z");
});

test("adjacent backfill chunks have no gap and no overlap", () => {
  const chunks = buildHotelPlannerBackfillChunks("2026-08-01", "2026-08-31");
  for (let i = 1; i < chunks.length; i++) {
    assert.equal(
      chunks[i].start.getTime(),
      chunks[i - 1].end.getTime(),
      `chunk ${i} start must equal chunk ${i - 1} end`,
    );
  }
});

test("backfill operator bounds are preserved after boundary fix", () => {
  assert.throws(() => buildHotelPlannerBackfillChunks("2026-08-01", "2026-09-01"), /31 days/);
  assert.throws(() => buildHotelPlannerBackfillChunks("2026-09-01", "2026-08-01"), /31 days/);
  const chunks = buildHotelPlannerBackfillChunks("2026-08-01", "2026-08-31");
  assert.ok(chunks.length <= 5, "must not exceed five provider calls");
  for (const chunk of chunks) {
    const days = (chunk.end.getTime() - chunk.start.getTime()) / 86_400_000;
    assert.ok(days <= 7, `chunk window ${days} days exceeds seven-day maximum`);
  }
});

test("rejects oversized response declarations and streamed bodies", async () => {
  const declared = new Response("small", { headers: { "content-length": String(HOTELPLANNER_REPORT_MAX_COMPRESSED_BYTES + 1) } });
  await assert.rejects(() => readBoundedResponse(declared, HOTELPLANNER_REPORT_MAX_COMPRESSED_BYTES));

  const streamed = new Response(new Uint8Array([1, 2, 3, 4]));
  await assert.rejects(() => readBoundedResponse(streamed, 3));
});

test("preflights the XLSX central directory and requires the expected worksheet", () => {
  const safe = zipSync({ "xl/worksheets/sheet1.xml": new TextEncoder().encode("<worksheet />") });
  assert.equal(inspectBoundedXlsxArchive(safe).entryCount, 1);

  const unexpected = zipSync({ "xl/worksheets/sheet2.xml": new TextEncoder().encode("<worksheet />") });
  assert.throws(() => inspectBoundedXlsxArchive(unexpected), /worksheet is missing/);

  const traversal = zipSync({ "../xl/worksheets/sheet1.xml": new Uint8Array([1]) });
  assert.throws(() => inspectBoundedXlsxArchive(traversal), /path is invalid/);
});

test("aborts provider operations at their configured timeout", async () => {
  const hangingFetch = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  })) as typeof fetch;
  await assert.rejects(() => fetchWithTimeout(hangingFetch, "https://example.invalid", {}, 5), /aborted/i);
});
