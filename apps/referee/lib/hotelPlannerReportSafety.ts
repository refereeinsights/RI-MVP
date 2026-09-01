export const HOTELPLANNER_REPORT_REQUEST_TIMEOUT_MS = 20_000;
export const HOTELPLANNER_REPORT_DOWNLOAD_TIMEOUT_MS = 30_000;
export const HOTELPLANNER_REPORT_MAX_COMPRESSED_BYTES = 20 * 1024 * 1024;
export const HOTELPLANNER_REPORT_MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const HOTELPLANNER_REPORT_MAX_ARCHIVE_ENTRIES = 64;
// Stage A observed 8 cancellation rows in seven days and the founder baseline
// contains 32 purchase rows in 31 days. 10,000 is intentionally conservative
// while still bounding parser memory and unexpected account-wide responses.
export const HOTELPLANNER_REPORT_MAX_ROWS = 10_000;
export const HOTELPLANNER_BACKFILL_MAX_DAYS = 31;
export const HOTELPLANNER_BACKFILL_CHUNK_DAYS = 7;
export const HOTELPLANNER_BACKFILL_MAX_CALLS = 5;

const AUDITED_DOWNLOAD_HOSTS = new Set(["hotelplanner.s3.amazonaws.com"]);

function normalizeHost(value: string) {
  const host = value.trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith(".") || host.endsWith(".")) {
    throw new Error("HotelPlanner report host configuration is invalid");
  }
  return host;
}

export function configuredHotelPlannerReportHosts(raw = process.env.HOTELPLANNER_REPORT_DOWNLOAD_HOSTS) {
  const hosts = new Set(AUDITED_DOWNLOAD_HOSTS);
  for (const value of raw?.split(",") ?? []) {
    if (value.trim()) hosts.add(normalizeHost(value));
  }
  return hosts;
}

export function validateHotelPlannerReportUrl(rawUrl: string, allowedHosts = configuredHotelPlannerReportHosts()) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("HotelPlanner report destination is invalid");
  }
  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error("HotelPlanner report destination is not allowlisted");
  }
  return url;
}

export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function readBoundedResponse(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("HotelPlanner report exceeds compressed limit");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("HotelPlanner report exceeds compressed limit");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function u16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

export function inspectBoundedXlsxArchive(bytes: Uint8Array) {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("HotelPlanner report is not an XLSX archive");
  let eocd = -1;
  const floor = Math.max(0, bytes.length - 65_557);
  for (let index = bytes.length - 22; index >= floor; index -= 1) {
    if (u32(bytes, index) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error("HotelPlanner XLSX archive directory is missing");
  const entryCount = u16(bytes, eocd + 10);
  if (entryCount < 1 || entryCount > HOTELPLANNER_REPORT_MAX_ARCHIVE_ENTRIES) {
    throw new Error("HotelPlanner XLSX archive entry count is invalid");
  }
  let cursor = u32(bytes, eocd + 16);
  let totalUncompressed = 0;
  let hasWorksheet = false;
  const decoder = new TextDecoder();
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (cursor + 46 > bytes.length || u32(bytes, cursor) !== 0x02014b50) {
      throw new Error("HotelPlanner XLSX archive directory is invalid");
    }
    const uncompressed = u32(bytes, cursor + 24);
    const nameLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const commentLength = u16(bytes, cursor + 32);
    const nameEnd = cursor + 46 + nameLength;
    if (nameEnd > bytes.length) throw new Error("HotelPlanner XLSX archive entry is invalid");
    const name = decoder.decode(bytes.subarray(cursor + 46, nameEnd));
    if (!name || name.startsWith("/") || name.includes("..") || name.includes("\\")) {
      throw new Error("HotelPlanner XLSX archive path is invalid");
    }
    totalUncompressed += uncompressed;
    if (totalUncompressed > HOTELPLANNER_REPORT_MAX_UNCOMPRESSED_BYTES) {
      throw new Error("HotelPlanner XLSX archive exceeds uncompressed limit");
    }
    if (name === "xl/worksheets/sheet1.xml") hasWorksheet = true;
    cursor = nameEnd + extraLength + commentLength;
  }
  if (!hasWorksheet) throw new Error("HotelPlanner XLSX worksheet is missing");
  return { entryCount, totalUncompressed };
}

function utcDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Backfill date is invalid");
  }
  return date;
}

export function buildHotelPlannerBackfillChunks(start: string, end: string) {
  const startDate = utcDay(start);
  const endDate = utcDay(end);
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  if (totalDays < 1 || totalDays > HOTELPLANNER_BACKFILL_MAX_DAYS) throw new Error("Backfill range must be 1-31 days");
  const chunks: Array<{ start: Date; end: Date }> = [];
  for (let offset = 0; offset < totalDays; offset += HOTELPLANNER_BACKFILL_CHUNK_DAYS) {
    const chunkStart = new Date(startDate.getTime() + offset * 86_400_000);
    // HP treats purchasedDateEnd as exclusive: the start of that calendar day in UTC. A
    // date-only string like "08/21/2026" means midnight of Aug 21, so bookings made later
    // on Aug 21 are excluded. Evidence: the Aug 2026 dry run returned 35 of 40 rows; the
    // 5 omissions fell on Aug 21 (1) and Aug 28 (4), which were the end days of their chunks.
    // Fix: send the first instant of the calendar day after the intended last day (half-open
    // window). Aug 15–21 chunk sends end=Aug 22, Aug 22–28 sends end=Aug 29, Aug 29–31
    // sends end=Sep 1. Adjacent chunk starts equal the prior chunk end, so no day is lost.
    const chunkLastDay = new Date(Math.min(endDate.getTime(), chunkStart.getTime() + 6 * 86_400_000));
    const chunkEnd = new Date(chunkLastDay.getTime() + 86_400_000);
    chunks.push({ start: chunkStart, end: chunkEnd });
  }
  if (chunks.length > HOTELPLANNER_BACKFILL_MAX_CALLS) throw new Error("Backfill exceeds five-call limit");
  return chunks;
}
