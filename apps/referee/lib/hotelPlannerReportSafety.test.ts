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
  assert.deepEqual(
    chunks.map(({ start, end }) => [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]),
    [
      ["2026-08-01", "2026-08-07"],
      ["2026-08-08", "2026-08-14"],
      ["2026-08-15", "2026-08-21"],
      ["2026-08-22", "2026-08-28"],
      ["2026-08-29", "2026-08-31"],
    ],
  );
  assert.throws(() => buildHotelPlannerBackfillChunks("2026-08-01", "2026-09-01"));
  assert.throws(() => buildHotelPlannerBackfillChunks("2026-08-02", "2026-08-01"));
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
