import test from "node:test";
import assert from "node:assert/strict";
import { zipSync } from "fflate";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://fixture.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "fixture-service-role-key";

type BookingSyncModule = typeof import("./hotelPlannerBookingSync");
let bookingSyncModule: Promise<BookingSyncModule> | null = null;
function loadBookingSync() {
  bookingSyncModule ??= import("./hotelPlannerBookingSync");
  return bookingSyncModule;
}

type BookingRow = import("./hotelPlannerBookingSync").BookingRow;

function fixtureRow(itinerary: string): BookingRow {
  return {
    itinerary_number: itinerary,
    confirmation_number: null,
    status: "Confirmed",
    purchased_serial: null,
    checkin_serial: null,
    checkout_serial: null,
    nights: null,
    rooms_count: null,
    hotel_name: null,
    hotel_city: null,
    hotel_state: null,
    hotel_country: null,
    hp_hotel_id: null,
    avg_rate_usd: null,
    total_usd: 100,
    expected_commission_usd: 10,
    paid_commission_usd: 0,
    commission_status: null,
    source: "TournamentInsights",
    keyword: null,
    job_code: null,
    custom1: null,
    custom2: null,
    custom3: null,
    custom4: null,
    custom5: null,
    custom6: null,
    custom7: null,
    custom8: null,
    cancel_date_serial: null,
    is_mobile: null,
    currency: "USD",
  };
}

test("builds independent purchased and cancellation report queries in UTC", async () => {
  const { buildHotelPlannerReportBody } = await loadBookingSync();
  const start = new Date("2026-08-25T00:00:00Z");
  const end = new Date("2026-08-31T00:00:00Z");
  assert.deepEqual(buildHotelPlannerReportBody(start, end, "purchased"), {
    reportType: "individual",
    includeCancelled: true,
    purchasedDateStart: "08/25/2026",
    purchasedDateEnd: "08/31/2026",
  });
  assert.deepEqual(buildHotelPlannerReportBody(start, end, "cancelled"), {
    reportType: "individual",
    includeCancelled: true,
    cancelledDateStart: "08/25/2026",
    cancelledDateEnd: "08/31/2026",
  });
});

test("repeated imports upsert by the same itinerary without multiplying rows", async () => {
  const { persistBookingRows } = await loadBookingSync();
  const stored = new Map<string, Record<string, unknown>>();
  const upsert = async (record: Record<string, unknown>) => {
    stored.set(String(record.itinerary_number), record);
    return { error: null };
  };
  const row = fixtureRow("sensitive-fixture-id");
  await persistBookingRows([row], "2026-08-31T00:00:00Z", upsert);
  await persistBookingRows([row], "2026-08-31T01:00:00Z", upsert);
  assert.equal(stored.size, 1);
  assert.equal(stored.get("sensitive-fixture-id")?.synced_at, "2026-08-31T01:00:00Z");
});

test("cancellation refresh changes lifecycle fields without overwriting economics", async () => {
  const { toCancellationUpsertRecord } = await loadBookingSync();
  const row = fixtureRow("fixture-cancelled");
  row.status = "Cancelled";
  row.cancel_date_serial = 46_000;
  row.total_usd = null;
  row.expected_commission_usd = null;
  const record = toCancellationUpsertRecord(row, "2026-08-31T00:00:00Z");
  assert.equal(record.itinerary_number, "fixture-cancelled");
  assert.equal(record.status, "Cancelled");
  assert.equal(typeof record.cancel_date, "string");
  assert.equal(Object.hasOwn(record, "total_usd"), false);
  assert.equal(Object.hasOwn(record, "expected_commission_usd"), false);
  assert.equal(Object.hasOwn(record, "paid_commission_usd"), false);
  assert.equal(Object.hasOwn(record, "source"), false);
});

test("persistence errors use a constant log without booking identifiers", async () => {
  const { persistBookingRows } = await loadBookingSync();
  const messages: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { messages.push(args); };
  try {
    const result = await persistBookingRows(
      [fixtureRow("must-not-appear")],
      "2026-08-31T00:00:00Z",
      async () => ({ error: { message: "provider detail must not be logged" } }),
    );
    assert.deepEqual(result, { inserted: 0, errors: 1 });
  } finally {
    console.error = original;
  }
  assert.deepEqual(messages, [["[hotel-booking-sync] booking upsert failures"]]);
  assert.equal(JSON.stringify(messages).includes("must-not-appear"), false);
  assert.equal(JSON.stringify(messages).includes("provider detail"), false);
});

test("bounded backfill is dry-run by default, sequential, and stops on first failure", async () => {
  const { executeHotelPlannerHistoricalBackfill } = await loadBookingSync();
  const chunks = [
    { start: new Date("2026-08-01T00:00:00Z"), end: new Date("2026-08-07T00:00:00Z") },
    { start: new Date("2026-08-08T00:00:00Z"), end: new Date("2026-08-14T00:00:00Z") },
    { start: new Date("2026-08-15T00:00:00Z"), end: new Date("2026-08-21T00:00:00Z") },
  ];
  let fetches = 0;
  let persists = 0;
  await assert.rejects(() => executeHotelPlannerHistoricalBackfill({
    chunks,
    apply: false,
    confirmedDryRun: false,
    fetchChunk: async () => {
      fetches += 1;
      if (fetches === 2) throw new Error("controlled provider failure");
      return [fixtureRow("one")];
    },
    persistRows: async () => { persists += 1; return { inserted: 1, errors: 0 }; },
  }), /controlled provider failure/);
  assert.equal(fetches, 2);
  assert.equal(persists, 0);

  await assert.rejects(() => executeHotelPlannerHistoricalBackfill({
    chunks: chunks.slice(0, 1),
    apply: true,
    confirmedDryRun: false,
    fetchChunk: async () => [],
    persistRows: async () => ({ inserted: 0, errors: 0 }),
  }), /prior dry-run confirmation/);
});

test("report download rejects redirects and parsed rows above the documented ceiling", async () => {
  const { downloadAndParseXlsx } = await loadBookingSync();
  const encoder = new TextEncoder();
  const header = '<row r="1"><c r="A1" t="inlineStr"><is><t>Itinerary</t></is></c></row>';
  const rows = Array.from({ length: 10_001 }, (_, index) =>
    `<row r="${index + 2}"><c r="A${index + 2}" t="inlineStr"><is><t>fixture-${index}</t></is></c></row>`
  ).join("");
  const archive = zipSync({
    "xl/worksheets/sheet1.xml": encoder.encode(`<worksheet><sheetData>${header}${rows}</sheetData></worksheet>`),
  });
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.redirect, "error");
    return new Response(new Uint8Array(archive).buffer as ArrayBuffer, { status: 200, headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
  }) as typeof fetch;
  await assert.rejects(
    () => downloadAndParseXlsx("https://hotelplanner.s3.amazonaws.com/fixture.xlsx?signature=not-logged", fetchImpl),
    /row limit exceeded/,
  );
});
