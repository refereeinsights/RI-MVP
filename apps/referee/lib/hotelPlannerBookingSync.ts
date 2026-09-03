import { createHmac } from "node:crypto";
import { unzipSync } from "fflate";
import { supabaseAdmin } from "./supabaseAdmin";
import { hotelSyncRunRepository } from "./hotelPlannerSyncHeartbeat.server";
import {
  type HotelSyncErrorStage,
  type HotelSyncRunRepository,
  type HotelSyncTrigger,
} from "./hotelPlannerSyncHeartbeat";
import {
  classifyHotelPlannerStatus,
  collectConfirmedBookingAttributionIds,
  isTournamentInsightsSource,
  parseHotelPlannerAttributionId,
  reconcileConfirmedBookingAttribution,
  summarizeHotelBookingRows,
} from "./hotelBookingReconciliation";
import {
  HOTELPLANNER_REPORT_DOWNLOAD_TIMEOUT_MS,
  HOTELPLANNER_REPORT_MAX_COMPRESSED_BYTES,
  HOTELPLANNER_REPORT_MAX_UNCOMPRESSED_BYTES,
  HOTELPLANNER_REPORT_MAX_ROWS,
  HOTELPLANNER_REPORT_REQUEST_TIMEOUT_MS,
  buildHotelPlannerBackfillChunks,
  fetchWithTimeout,
  inspectBoundedXlsxArchive,
  readBoundedResponse,
  validateHotelPlannerReportUrl,
} from "./hotelPlannerReportSafety";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type HotelPlannerSyncConfig = {
  apiKey: string;
  secretKey: string;
  accountId: string;
  siteId: string;
  baseUrl: string;
};

function loadConfig(): HotelPlannerSyncConfig {
  const apiKey = process.env.HOTELPLANNER_API_KEY ?? "";
  const secretKey = process.env.HOTELPLANNER_SECRET_KEY ?? "";
  const accountId = process.env.HOTELPLANNER_ACCOUNT_ID ?? "";
  const siteId = process.env.HOTELPLANNER_SITE_ID ?? "";
  const baseUrl = (process.env.HOTELPLANNER_BASE_URL ?? "https://api.hotelplanner.com/hpapi/v2.3/").replace(/\/$/, "");
  if (!apiKey || !secretKey || !accountId || !siteId) {
    throw new Error("HotelPlanner sync: missing required env vars (HOTELPLANNER_API_KEY, HOTELPLANNER_SECRET_KEY, HOTELPLANNER_ACCOUNT_ID, HOTELPLANNER_SITE_ID)");
  }
  return { apiKey, secretKey, accountId, siteId, baseUrl };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function buildAuthToken(config: HotelPlannerSyncConfig, epoch: number): string {
  const apiKeyB64 = Buffer.from(config.apiKey).toString("base64url");
  const signature = createHmac("sha256", config.secretKey)
    .update(`${apiKeyB64}|${config.accountId}|${epoch}`)
    .digest("base64url");
  return `${apiKeyB64}.${signature}`;
}

function buildHeaders(config: HotelPlannerSyncConfig): HeadersInit {
  const epoch = Math.floor(Date.now() / 1000);
  return {
    Authorization: buildAuthToken(config, epoch),
    "x-hp-api-siteid": String(config.siteId),
    "content-type": "application/json; charset=UTF-8",
  };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function fmtMmDdYyyy(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

// Excel serial dates: days since December 30, 1899 (Excel epoch with leap-year bug).
const EXCEL_EPOCH_MS = new Date("1899-12-30T00:00:00Z").getTime();

function excelSerialToDate(serial: number | null | undefined): Date | null {
  if (serial === null || serial === undefined || !Number.isFinite(serial)) return null;
  return new Date(EXCEL_EPOCH_MS + serial * 86400000);
}

function excelSerialToIsoDate(serial: number | null | undefined): string | null {
  const d = excelSerialToDate(serial);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// getReport — fetch xlsx from HotelPlanner
// ---------------------------------------------------------------------------

type GetReportResponse = {
  downloadUrl: string;
  recordCount: number;
  fileName: string;
};

export type ReportDateField = "purchased" | "cancelled";

export function buildHotelPlannerReportBody(startDate: Date, endDate: Date, dateField: ReportDateField) {
  const dateFields = dateField === "cancelled"
    ? { cancelledDateStart: fmtMmDdYyyy(startDate), cancelledDateEnd: fmtMmDdYyyy(endDate) }
    : { purchasedDateStart: fmtMmDdYyyy(startDate), purchasedDateEnd: fmtMmDdYyyy(endDate) };
  return { reportType: "individual", includeCancelled: true, ...dateFields };
}

async function callGetReport(
  config: HotelPlannerSyncConfig,
  startDate: Date,
  endDate: Date,
  dateField: ReportDateField,
  fetchImpl: typeof fetch = fetch,
): Promise<GetReportResponse> {
  const epoch = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    method: "getReport",
    epoch: String(epoch),
    customerIPAddress: "10.0.0.1",
    customerUserAgent: "TI-Admin-BookingSync/1.0",
  });
  const body = buildHotelPlannerReportBody(startDate, endDate, dateField);

  const resp = await fetchWithTimeout(fetchImpl, `${config.baseUrl}/?${params}`, {
    method: "POST",
    headers: buildHeaders(config),
    body: JSON.stringify(body),
  }, HOTELPLANNER_REPORT_REQUEST_TIMEOUT_MS);

  const data = await resp.json() as Record<string, unknown>;
  if (!resp.ok || !data.downloadUrl) {
    throw new Error("HotelPlanner report request failed");
  }

  return {
    downloadUrl: String(data.downloadUrl),
    recordCount: Number(data.recordCount ?? 0),
    fileName: String(data.fileName ?? ""),
  };
}

// ---------------------------------------------------------------------------
// xlsx parsing (inline XML; no external library dependency)
// ---------------------------------------------------------------------------

export type BookingRow = {
  itinerary_number: string | null;
  confirmation_number: string | null;
  status: string | null;
  purchased_serial: number | null;
  checkin_serial: number | null;
  checkout_serial: number | null;
  nights: number | null;
  rooms_count: number | null;
  hotel_name: string | null;
  hotel_city: string | null;
  hotel_state: string | null;
  hotel_country: string | null;
  hp_hotel_id: string | null;
  avg_rate_usd: number | null;
  total_usd: number | null;
  expected_commission_usd: number | null;
  paid_commission_usd: number | null;
  commission_status: string | null;
  source: string | null;
  keyword: string | null;
  job_code: string | null;
  custom1: string | null;
  custom2: string | null;
  custom3: string | null;
  custom4: string | null;
  custom5: string | null;
  custom6: string | null;
  custom7: string | null;
  custom8: string | null;
  cancel_date_serial: number | null;
  is_mobile: boolean | null;
  currency: string | null;
};

// Column letter(s) → 0-based index
function colLetterToIndex(col: string): number {
  const letters = col.toUpperCase();
  let index = 0;
  for (let i = 0; i < letters.length; i++) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }
  return index - 1;
}

// Extract the column letter portion from a cell reference like "AB3"
function cellColLetter(ref: string): string {
  return ref.replace(/[0-9]/g, "");
}

function parseXlsxSheetXml(sheetXml: string): Array<Record<number, string>> {
  // Extract rows
  const rowRegex = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  const cellRegex = /<c r="([^"]+)"[^>]*t="([^"]*)"[^>]*>(?:<is><t[^>]*>([\s\S]*?)<\/t><\/is>|<v[^>]*>([\s\S]*?)<\/v>)/g;

  const rowsMap = new Map<number, Record<number, string>>();
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowNum = parseInt(rowMatch[1], 10);
    const rowContent = rowMatch[2];
    const cols: Record<number, string> = {};

    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const ref = cellMatch[1];
      const type = cellMatch[2];
      const inlineVal = cellMatch[3];
      const numVal = cellMatch[4];
      const colIdx = colLetterToIndex(cellColLetter(ref));
      cols[colIdx] = (type === "inlineStr" ? (inlineVal ?? "") : (numVal ?? "")).trim();
    }

    rowsMap.set(rowNum, cols);
  }

  return Array.from(rowsMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, cols]) => cols);
}

// Map header row column label → 0-based column index
function buildHeaderIndex(headerRow: Record<number, string>): Map<string, number> {
  const map = new Map<string, number>();
  for (const [colIdx, label] of Object.entries(headerRow)) {
    if (label) map.set(label.trim(), Number(colIdx));
  }
  return map;
}

function getStr(row: Record<number, string>, headerIndex: Map<string, number>, name: string): string | null {
  const idx = headerIndex.get(name);
  if (idx === undefined) return null;
  const val = (row[idx] ?? "").trim();
  return val !== "" ? val : null;
}

function getNum(row: Record<number, string>, headerIndex: Map<string, number>, name: string): number | null {
  const raw = getStr(row, headerIndex, name);
  if (raw === null) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function getBool(row: Record<number, string>, headerIndex: Map<string, number>, name: string): boolean | null {
  const raw = getStr(row, headerIndex, name);
  if (raw === null) return null;
  const lower = raw.toLowerCase();
  if (lower === "yes" || lower === "y" || lower === "1" || lower === "true") return true;
  if (lower === "no" || lower === "n" || lower === "0" || lower === "false") return false;
  return null;
}

// Real column names from verified getReport response (audit 2026-08-24)
const COL = {
  Itinerary:        "Itinerary",
  Confirmation:     "Confirmation",
  Status:           "Status",
  Name:             "Name",
  Purchased:        "Purchased",
  CheckIn:          "Check-In",
  CheckOut:         "Check-Out",
  Nights:           "Nights",
  Rooms:            "Rm.s",
  Hotel:            "Hotel",
  HotelCity:        "Hotel City",
  HotelState:       "Hotel State",
  HotelCountry:     "Hotel Country",
  HotelId:          "Hotel ID",
  AvgRate:          "Avg Rate",
  Total:            "Total",
  ExpComm:          "Exp Comm USD",
  CommUsd:          "Comm. USD",
  Paid:             "Paid",
  Source:           "Source",
  Keyword:          "Keyword",
  JobCode:          "Job Code",
  Custom1:          "Custom1",
  Custom2:          "Custom2",
  Custom3:          "Custom3",
  Custom4:          "Custom4",
  Custom5:          "Custom5",
  Custom6:          "Custom6",
  Custom7:          "Custom7",
  Custom8:          "Custom8",
  CancelDate:       "Cancel Date",
  IsMobile:         "IsMobile",
  Currency:         "Currency",
} as const;

function mapDataRow(row: Record<number, string>, headerIndex: Map<string, number>): BookingRow {
  return {
    itinerary_number:       getStr(row, headerIndex, COL.Itinerary),
    confirmation_number:    getStr(row, headerIndex, COL.Confirmation),
    status:                 getStr(row, headerIndex, COL.Status),
    purchased_serial:       getNum(row, headerIndex, COL.Purchased),
    checkin_serial:         getNum(row, headerIndex, COL.CheckIn),
    checkout_serial:        getNum(row, headerIndex, COL.CheckOut),
    nights:                 getNum(row, headerIndex, COL.Nights),
    rooms_count:            getNum(row, headerIndex, COL.Rooms),
    hotel_name:             getStr(row, headerIndex, COL.Hotel),
    hotel_city:             getStr(row, headerIndex, COL.HotelCity),
    hotel_state:            getStr(row, headerIndex, COL.HotelState),
    hotel_country:          getStr(row, headerIndex, COL.HotelCountry),
    hp_hotel_id:            getStr(row, headerIndex, COL.HotelId),
    avg_rate_usd:           getNum(row, headerIndex, COL.AvgRate),
    total_usd:              getNum(row, headerIndex, COL.Total),
    expected_commission_usd: getNum(row, headerIndex, COL.ExpComm),
    paid_commission_usd:    getNum(row, headerIndex, COL.CommUsd),
    commission_status:      getStr(row, headerIndex, COL.Paid),
    source:                 getStr(row, headerIndex, COL.Source),
    keyword:                getStr(row, headerIndex, COL.Keyword),
    job_code:               getStr(row, headerIndex, COL.JobCode),
    custom1:                getStr(row, headerIndex, COL.Custom1),
    custom2:                getStr(row, headerIndex, COL.Custom2),
    custom3:                getStr(row, headerIndex, COL.Custom3),
    custom4:                getStr(row, headerIndex, COL.Custom4),
    custom5:                getStr(row, headerIndex, COL.Custom5),
    custom6:                getStr(row, headerIndex, COL.Custom6),
    custom7:                getStr(row, headerIndex, COL.Custom7),
    custom8:                getStr(row, headerIndex, COL.Custom8),
    cancel_date_serial:     getNum(row, headerIndex, COL.CancelDate),
    is_mobile:              getBool(row, headerIndex, COL.IsMobile),
    currency:               getStr(row, headerIndex, COL.Currency),
  };
}

export async function downloadAndParseXlsx(
  downloadUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BookingRow[]> {
  let buf: Uint8Array;
  try {
    const reportUrl = validateHotelPlannerReportUrl(downloadUrl);
    const resp = await fetchWithTimeout(fetchImpl, reportUrl, { redirect: "error" }, HOTELPLANNER_REPORT_DOWNLOAD_TIMEOUT_MS);
    if (!resp.ok) throw new Error("HotelPlanner report download failed");
    const contentType = (resp.headers.get("content-type") ?? "").toLowerCase();
    if (contentType && !contentType.includes("spreadsheet") && !contentType.includes("octet-stream") && !contentType.includes("zip")) {
      throw new Error("HotelPlanner report content type is invalid");
    }
    buf = await readBoundedResponse(resp, HOTELPLANNER_REPORT_MAX_COMPRESSED_BYTES);
  } catch (error) {
    throw new HotelPlannerReportStageError("download", error);
  }

  try {
    inspectBoundedXlsxArchive(buf);
    // Extract xl/worksheets/sheet1.xml from the xlsx zip using fflate (pure JS, Vercel-safe)
    const unzipped = unzipSync(buf);
    const totalUncompressed = Object.values(unzipped).reduce((sum, bytes) => sum + bytes.byteLength, 0);
    if (totalUncompressed > HOTELPLANNER_REPORT_MAX_UNCOMPRESSED_BYTES) throw new Error("HotelPlanner XLSX archive exceeds uncompressed limit");
    const sheetBytes = unzipped["xl/worksheets/sheet1.xml"];
    if (!sheetBytes) return [];

    const sheetXml = new TextDecoder().decode(sheetBytes);
    const allRows = parseXlsxSheetXml(sheetXml);
    if (allRows.length < 2) return []; // header + at least one data row

    const headerIndex = buildHeaderIndex(allRows[0]);
    const dataRows = allRows.slice(1);
    if (dataRows.length > HOTELPLANNER_REPORT_MAX_ROWS) throw new Error("HotelPlanner report row limit exceeded");

    return dataRows
      .map((row) => mapDataRow(row, headerIndex))
      .filter((row) => row.itinerary_number !== null);
  } catch (error) {
    throw new HotelPlannerReportStageError("parse", error);
  }
}

export class HotelPlannerReportStageError extends Error {
  constructor(public readonly kind: "download" | "parse", cause: unknown) {
    super(cause instanceof Error ? cause.message : "HotelPlanner report processing failed");
    this.name = "HotelPlannerReportStageError";
  }
}

// ---------------------------------------------------------------------------
// Upsert to ti_hotel_bookings
// ---------------------------------------------------------------------------

export type UpsertRecord = Record<string, unknown>;

export function toUpsertRecord(row: BookingRow, syncedAt: string): UpsertRecord {
  return {
    itinerary_number:         row.itinerary_number,
    confirmation_number:      row.confirmation_number,
    status:                   row.status,
    outbound_attribution_id:  parseHotelPlannerAttributionId(row.custom3),
    purchased_at:             excelSerialToDate(row.purchased_serial)?.toISOString() ?? null,
    checkin_date:             excelSerialToIsoDate(row.checkin_serial),
    checkout_date:            excelSerialToIsoDate(row.checkout_serial),
    nights:                   row.nights,
    rooms_count:              row.rooms_count,
    hotel_name:               row.hotel_name,
    hotel_city:               row.hotel_city,
    hotel_state:              row.hotel_state,
    hotel_country:            row.hotel_country,
    hp_hotel_id:              row.hp_hotel_id,
    avg_rate_usd:             row.avg_rate_usd,
    total_usd:                row.total_usd,
    expected_commission_usd:  row.expected_commission_usd,
    paid_commission_usd:      row.paid_commission_usd,
    commission_status:        row.commission_status,
    source:                   row.source,
    keyword:                  row.keyword,
    job_code:                 row.job_code,
    custom1:                  row.custom1,
    custom2:                  row.custom2,
    custom3:                  row.custom3,
    custom4:                  row.custom4,
    custom5:                  row.custom5,
    custom6:                  row.custom6,
    custom7:                  row.custom7,
    custom8:                  row.custom8,
    cancel_date:              excelSerialToIsoDate(row.cancel_date_serial),
    is_mobile:                row.is_mobile,
    currency:                 row.currency,
    synced_at:                syncedAt,
  };
}

export function toCancellationUpsertRecord(row: BookingRow, syncedAt: string): UpsertRecord {
  return {
    itinerary_number: row.itinerary_number,
    status: row.status,
    cancel_date: excelSerialToIsoDate(row.cancel_date_serial),
    synced_at: syncedAt,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type BookingSyncResult = {
  lookbackDays: number;
  reportFetched: boolean;
  recordCount: number;
  parsed: number;
  inserted: number;
  updated: number;
  errors: number;
  syncedAt: string;
  cancellationRefresh: "completed" | "failed";
  cancellationParsed: number;
};

type BookingUpsert = (record: UpsertRecord) => Promise<{ error: { message?: string } | null }>;

export async function persistBookingRows(
  rows: BookingRow[],
  syncedAt: string,
  upsert: BookingUpsert,
  mapRecord: (row: BookingRow, syncedAt: string) => UpsertRecord = toUpsertRecord,
) {
  let inserted = 0;
  let errors = 0;
  for (const row of rows) {
    if (!row.itinerary_number) continue;
    const { error } = await upsert(mapRecord(row, syncedAt));
    if (error) {
      errors += 1;
    } else {
      inserted += 1;
    }
  }
  if (errors > 0) console.error("[hotel-booking-sync] booking upsert failures");
  return { inserted, errors };
}

function databaseUpsert(record: UpsertRecord) {
  return (supabaseAdmin as any).from("ti_hotel_bookings").upsert(record, {
    onConflict: "itinerary_number",
    ignoreDuplicates: false,
    defaultToNull: false,
  }) as Promise<{ error: { message?: string } | null }>;
}

async function fetchReportRows(
  config: HotelPlannerSyncConfig,
  startDate: Date,
  endDate: Date,
  dateField: ReportDateField,
  fetchImpl: typeof fetch = fetch,
) {
  let report: GetReportResponse;
  try {
    report = await callGetReport(config, startDate, endDate, dateField, fetchImpl);
  } catch {
    throw new HotelSyncStageFailure(dateField === "purchased" ? "provider_request" : "cancellation_request");
  }
  let rows: BookingRow[];
  try {
    rows = await downloadAndParseXlsx(report.downloadUrl, fetchImpl);
  } catch (error) {
    const parse = error instanceof HotelPlannerReportStageError && error.kind === "parse";
    throw new HotelSyncStageFailure(dateField === "purchased"
      ? (parse ? "report_parse" : "report_download")
      : (parse ? "cancellation_parse" : "cancellation_download"));
  }
  return { report, rows };
}

export class HotelSyncStageFailure extends Error {
  constructor(public readonly stage: HotelSyncErrorStage) {
    super("HotelPlanner sync stage failed");
    this.name = "HotelSyncStageFailure";
  }
}

type BookingSyncExecutionDependencies = {
  now: Date;
  repository: HotelSyncRunRepository;
  fetchRows: (start: Date, end: Date, field: ReportDateField) => Promise<{ report: GetReportResponse; rows: BookingRow[] }>;
  persistRows: (
    rows: BookingRow[],
    syncedAt: string,
    mode: "purchase" | "cancellation",
  ) => Promise<{ inserted: number; errors: number }>;
};

function failureStage(error: unknown, fallback: HotelSyncErrorStage): HotelSyncErrorStage {
  return error instanceof HotelSyncStageFailure ? error.stage : fallback;
}

export async function executeHotelPlannerBookingSync(input: {
  lookbackDays: number;
  trigger: HotelSyncTrigger;
  dependencies: BookingSyncExecutionDependencies;
}): Promise<BookingSyncResult> {
  const { lookbackDays, trigger, dependencies } = input;
  if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 31) {
    throw new Error("HotelPlanner sync lookback must be 1-31 days");
  }
  const now = dependencies.now;
  const startDate = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const syncedAt = now.toISOString();
  const runId = await dependencies.repository.start({
    trigger,
    purchaseWindowStart: startDate.toISOString(),
    purchaseWindowEnd: syncedAt,
  });

  let purchase;
  try {
    purchase = await dependencies.fetchRows(startDate, now, "purchased");
  } catch (error) {
    const finalized = await dependencies.repository.finalize(runId, {
      status: "failed",
      purchaseProviderCalls: 1,
      purchaseRowsReturned: 0,
      cancellationProviderCalls: 0,
      cancellationRowsReturned: 0,
      rowsUpserted: 0,
      rowsFailed: 0,
      errorStage: failureStage(error, "provider_request"),
    });
    if (!finalized) throw new Error("HotelPlanner heartbeat finalization rejected");
    throw new Error("HotelPlanner purchase sync failed");
  }
  let purchasePersisted: { inserted: number; errors: number };
  try {
    purchasePersisted = await dependencies.persistRows(purchase.rows, syncedAt, "purchase");
  } catch {
    const finalized = await dependencies.repository.finalize(runId, {
      status: "failed",
      purchaseProviderCalls: 1,
      purchaseRowsReturned: purchase.rows.length,
      cancellationProviderCalls: 0,
      cancellationRowsReturned: 0,
      rowsUpserted: 0,
      rowsFailed: purchase.rows.length,
      errorStage: "purchase_upsert",
    });
    if (!finalized) throw new Error("HotelPlanner heartbeat finalization rejected");
    throw new Error("HotelPlanner purchase persistence failed");
  }

  let cancellationRefresh: BookingSyncResult["cancellationRefresh"] = "completed";
  let cancellationParsed = 0;
  let cancellationPersistenceFailedRows = 0;
  let cancellationPersisted = { inserted: 0, errors: 0 };
  let errorStage: HotelSyncErrorStage | null = purchasePersisted.errors > 0 ? "purchase_upsert" : null;
  try {
    const cancellationStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const cancellation = await dependencies.fetchRows(cancellationStart, now, "cancelled");
    cancellationParsed = cancellation.rows.length;
    try {
      cancellationPersisted = await dependencies.persistRows(cancellation.rows, syncedAt, "cancellation");
      if (cancellationPersisted.errors > 0) errorStage = "cancellation_upsert";
    } catch {
      cancellationRefresh = "failed";
      cancellationPersistenceFailedRows = cancellation.rows.length;
      errorStage = "cancellation_upsert";
      console.error("[hotel-booking-sync] cancellation refresh failed");
    }
  } catch (error) {
    cancellationRefresh = "failed";
    errorStage = failureStage(error, "cancellation_request");
    console.error("[hotel-booking-sync] cancellation refresh failed");
  }

  const totalErrors = purchasePersisted.errors + cancellationPersisted.errors + cancellationPersistenceFailedRows;
  const status = cancellationRefresh === "failed" || totalErrors > 0 ? "partial" : "succeeded";
  const finalized = await dependencies.repository.finalize(runId, {
    status,
    purchaseProviderCalls: 1,
    purchaseRowsReturned: purchase.rows.length,
    cancellationProviderCalls: 1,
    cancellationRowsReturned: cancellationParsed,
    rowsUpserted: purchasePersisted.inserted + cancellationPersisted.inserted,
    rowsFailed: totalErrors,
    errorStage,
  });
  if (!finalized) throw new Error("HotelPlanner heartbeat finalization rejected");

  return {
    lookbackDays,
    reportFetched: true,
    recordCount: purchase.report.recordCount,
    parsed: purchase.rows.length,
    inserted: purchasePersisted.inserted + cancellationPersisted.inserted,
    updated: 0,
    errors: totalErrors,
    syncedAt,
    cancellationRefresh,
    cancellationParsed,
  };
}

export async function syncHotelPlannerBookings(
  lookbackDays = 7,
  options: { trigger?: HotelSyncTrigger } = {},
): Promise<BookingSyncResult> {
  let config: HotelPlannerSyncConfig | null = null;
  const getConfig = () => (config ??= loadConfig());
  return executeHotelPlannerBookingSync({
    lookbackDays,
    trigger: options.trigger ?? "manual_operator",
    dependencies: {
      now: new Date(),
      repository: hotelSyncRunRepository,
      fetchRows: (start, end, field) => fetchReportRows(getConfig(), start, end, field),
      persistRows: (rows, syncedAt, mode) => persistBookingRows(
        rows,
        syncedAt,
        databaseUpsert,
        mode === "cancellation" ? toCancellationUpsertRecord : toUpsertRecord,
      ),
    },
  });
}

export type HotelPlannerBackfillResult = {
  mode: "dry-run" | "apply";
  chunks: number;
  providerCalls: number;
  parsed: number;
  persisted: number;
  errors: number;
};

type BackfillChunk = { start: Date; end: Date };

export async function executeHotelPlannerHistoricalBackfill(input: {
  chunks: BackfillChunk[];
  apply: boolean;
  confirmedDryRun: boolean;
  fetchChunk: (chunk: BackfillChunk) => Promise<BookingRow[]>;
  persistRows: (rows: BookingRow[]) => Promise<{ inserted: number; errors: number }>;
}): Promise<HotelPlannerBackfillResult> {
  if (input.apply && !input.confirmedDryRun) throw new Error("Backfill apply requires prior dry-run confirmation");
  let parsed = 0;
  let persisted = 0;
  let errors = 0;
  for (const chunk of input.chunks) {
    // Deliberately sequential. Any thrown provider/download/parser/persistence
    // error stops the run immediately; this operator path has no retry loop.
    const rows = await input.fetchChunk(chunk);
    parsed += rows.length;
    if (input.apply) {
      const saved = await input.persistRows(rows);
      persisted += saved.inserted;
      errors += saved.errors;
      if (saved.errors > 0) throw new Error("HotelPlanner backfill persistence failed");
    }
  }
  return {
    mode: input.apply ? "apply" : "dry-run",
    chunks: input.chunks.length,
    providerCalls: input.chunks.length,
    parsed,
    persisted,
    errors,
  };
}

export async function runHotelPlannerHistoricalBackfill(input: {
  start: string;
  end: string;
  apply?: boolean;
  confirmedDryRun?: boolean;
}): Promise<HotelPlannerBackfillResult> {
  const chunks = buildHotelPlannerBackfillChunks(input.start, input.end);
  const config = loadConfig();
  const syncedAt = new Date().toISOString();
  return executeHotelPlannerHistoricalBackfill({
    chunks,
    apply: Boolean(input.apply),
    confirmedDryRun: Boolean(input.confirmedDryRun),
    fetchChunk: async (chunk) => (await fetchReportRows(config, chunk.start, chunk.end, "purchased")).rows,
    persistRows: (rows) => persistBookingRows(rows, syncedAt, databaseUpsert),
  });
}

export type HotelBookingSummary = {
  confirmedCount: number;
  cancelledCount: number;
  otherCount: number;
  unknownCount: number;
  otherSourceCount: number;
  // Attribution breakdown (confirmed bookings only)
  reconciliationStatus: "available" | "unavailable";
  matchedCount: number | null;
  orphanedValidTokenCount: number | null;
  missingTokenCount: number | null;
  invalidTokenCount: number | null;
  confirmedBookingValueUsd: number;
  confirmedExpectedCommissionUsd: number;
  providerReportedPaidCommissionUsd: number;
  topTournamentSlugs: Array<{ slug: string; count: number }>;
  // Sync freshness — null when ti_hotel_bookings has no rows yet
  lastSyncedAt: string | null;
};

export async function loadHotelBookingSummary(windowDays = 7): Promise<HotelBookingSummary> {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const empty: HotelBookingSummary = {
    confirmedCount: 0,
    cancelledCount: 0,
    otherCount: 0,
    unknownCount: 0,
    otherSourceCount: 0,
    reconciliationStatus: "available",
    matchedCount: 0,
    orphanedValidTokenCount: 0,
    missingTokenCount: 0,
    invalidTokenCount: 0,
    confirmedBookingValueUsd: 0,
    confirmedExpectedCommissionUsd: 0,
    providerReportedPaidCommissionUsd: 0,
    topTournamentSlugs: [],
    lastSyncedAt: null,
  };

  const [windowResult, syncResult] = await Promise.all([
    (supabaseAdmin as any)
      .from("ti_hotel_bookings")
      .select("status,source,total_usd,expected_commission_usd,paid_commission_usd,custom2,custom3,outbound_attribution_id")
      .gte("purchased_at", cutoff),
    (supabaseAdmin as any)
      .from("ti_hotel_bookings")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (windowResult.error) {
    console.error("[hotel-booking-sync] summary load error", windowResult.error.message);
    return empty;
  }

  const rows = (windowResult.data ?? []) as Array<{
    status: string | null;
    source: string | null;
    total_usd: number | null;
    expected_commission_usd: number | null;
    paid_commission_usd: number | null;
    custom2: string | null;
    custom3: string | null;
    outbound_attribution_id: string | null;
  }>;

  const totals = summarizeHotelBookingRows(rows);

  const lastSyncedAt = (syncResult.data as { synced_at: string } | null)?.synced_at ?? null;
  const attributionIds = collectConfirmedBookingAttributionIds(rows);
  let matchedOutboundAttributionIds: Set<string> | null = new Set();
  const batchSize = 200;
  for (let offset = 0; offset < attributionIds.length; offset += batchSize) {
    const result = await (supabaseAdmin as any)
      .from("ti_outbound_clicks")
      .select("outbound_attribution_id")
      .in("outbound_attribution_id", attributionIds.slice(offset, offset + batchSize));
    if (result.error) {
      console.error("[hotel-booking-sync] outbound reconciliation error", result.error.message);
      matchedOutboundAttributionIds = null;
      break;
    }
    for (const row of (result.data ?? []) as Array<{ outbound_attribution_id: string | null }>) {
      if (row.outbound_attribution_id) matchedOutboundAttributionIds.add(row.outbound_attribution_id.toLowerCase());
    }
  }
  const reconciliation = reconcileConfirmedBookingAttribution(rows, matchedOutboundAttributionIds);

  return {
    confirmedCount: totals.confirmedCount,
    cancelledCount: totals.cancelledCount,
    otherCount: totals.otherCount,
    unknownCount: totals.unknownCount,
    otherSourceCount: totals.otherSourceCount,
    reconciliationStatus: reconciliation.status,
    matchedCount: reconciliation.matchedCount,
    orphanedValidTokenCount: reconciliation.orphanedValidTokenCount,
    missingTokenCount: reconciliation.missingTokenCount,
    invalidTokenCount: reconciliation.invalidTokenCount,
    confirmedBookingValueUsd: totals.confirmedBookingValueUsd,
    confirmedExpectedCommissionUsd: totals.confirmedExpectedCommissionUsd,
    providerReportedPaidCommissionUsd: totals.providerReportedPaidCommissionUsd,
    topTournamentSlugs: totals.topTournamentSlugs,
    lastSyncedAt,
  };
}

// ---------------------------------------------------------------------------
// Lifetime (all-time) summary — no date filter.
// Use this for cumulative reporting once the sync has been running long enough
// to represent the full booking history. The rolling 7-day sync accumulates
// records over time; a manual backfill (syncHotelPlannerBookings with a large
// lookbackDays) is needed to populate data from before the sync started.
// Not included in the daily email by default — call separately when needed.
// ---------------------------------------------------------------------------

export type HotelBookingLifetimeSummary = {
  totalCount: number;
  confirmedCount: number;
  cancelledCount: number;
  pendingCount: number;
  totalBookingValueUsd: number;
  expectedCommissionUsd: number;
  paidCommissionUsd: number;
  earliestPurchasedAt: string | null;
  latestPurchasedAt: string | null;
  topTournamentSlugs: Array<{ slug: string; count: number }>;
  topHotels: Array<{ name: string; count: number; totalUsd: number }>;
};

export async function loadHotelBookingLifetimeSummary(): Promise<HotelBookingLifetimeSummary> {
  const { data, error } = await (supabaseAdmin as any)
    .from("ti_hotel_bookings")
    .select("status,source,total_usd,expected_commission_usd,paid_commission_usd,custom2,hotel_name,purchased_at")
    .order("purchased_at", { ascending: true });

  if (error) {
    console.error("[hotel-booking-sync] lifetime summary error", error.message);
    return {
      totalCount: 0,
      confirmedCount: 0,
      cancelledCount: 0,
      pendingCount: 0,
      totalBookingValueUsd: 0,
      expectedCommissionUsd: 0,
      paidCommissionUsd: 0,
      earliestPurchasedAt: null,
      latestPurchasedAt: null,
      topTournamentSlugs: [],
      topHotels: [],
    };
  }

  const rows = (data ?? []) as Array<{
    status: string | null;
    source: string | null;
    total_usd: number | null;
    expected_commission_usd: number | null;
    paid_commission_usd: number | null;
    custom2: string | null;
    hotel_name: string | null;
    purchased_at: string | null;
  }>;

  let confirmedCount = 0;
  let cancelledCount = 0;
  let pendingCount = 0;
  let totalBookingValueUsd = 0;
  let expectedCommissionUsd = 0;
  let paidCommissionUsd = 0;
  const slugCounts = new Map<string, number>();
  const hotelTotals = new Map<string, { count: number; totalUsd: number }>();
  let earliestPurchasedAt: string | null = null;
  let latestPurchasedAt: string | null = null;
  let totalCount = 0;

  for (const row of rows) {
    if (!isTournamentInsightsSource(row.source)) continue;
    totalCount += 1;
    const status = classifyHotelPlannerStatus(row.status);
    if (status === "confirmed") {
      confirmedCount += 1;
      totalBookingValueUsd += Number(row.total_usd ?? 0);
      expectedCommissionUsd += Number(row.expected_commission_usd ?? 0);
    }
    else if (status === "cancelled") cancelledCount += 1;
    else pendingCount += 1;

    paidCommissionUsd += Number(row.paid_commission_usd ?? 0);

    if (row.purchased_at) {
      if (!earliestPurchasedAt || row.purchased_at < earliestPurchasedAt) earliestPurchasedAt = row.purchased_at;
      if (!latestPurchasedAt || row.purchased_at > latestPurchasedAt) latestPurchasedAt = row.purchased_at;
    }

    if (status === "confirmed") {
      const slug = (row.custom2 ?? "").trim();
      if (slug) slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
      const hotel = (row.hotel_name ?? "").trim();
      if (hotel) {
        const existing = hotelTotals.get(hotel) ?? { count: 0, totalUsd: 0 };
        hotelTotals.set(hotel, { count: existing.count + 1, totalUsd: existing.totalUsd + Number(row.total_usd ?? 0) });
      }
    }
  }

  const topTournamentSlugs = Array.from(slugCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([slug, count]) => ({ slug, count }));

  const topHotels = Array.from(hotelTotals.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([name, { count, totalUsd }]) => ({ name, count, totalUsd }));

  return {
    totalCount,
    confirmedCount,
    cancelledCount,
    pendingCount,
    totalBookingValueUsd,
    expectedCommissionUsd,
    paidCommissionUsd,
    earliestPurchasedAt,
    latestPurchasedAt,
    topTournamentSlugs,
    topHotels,
  };
}
