export type AdminEmailDegradedSection = {
  section: string;
  category: string;
};

export type AdminEmailSectionResult<T> = {
  value: T | null;
  degraded: AdminEmailDegradedSection | null;
  durationMs: number;
};

type SectionLogger = (entry: Record<string, unknown>) => void;

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

export function startOfDayInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? NaN);
  const month = Number(parts.find((part) => part.type === "month")?.value ?? NaN);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? NaN);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return startOfUtcDay(date);

  const guessUtc = new Date(Date.UTC(year, month - 1, day));
  const offsetParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(guessUtc);
  const timeZoneName = offsetParts.find((part) => part.type === "timeZoneName")?.value ?? "";
  const match = timeZoneName.match(/GMT([+-]\d{2}):(\d{2})/);
  if (!match) return guessUtc;

  const sign = match[1].startsWith("-") ? -1 : 1;
  const offsetMinutes = sign * (Math.abs(Number(match[1])) * 60 + Number(match[2]));
  return new Date(guessUtc.getTime() - offsetMinutes * 60 * 1000);
}

function addCalendarDaysInTimeZone(dayStart: Date, days: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(dayStart);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? dayStart.getUTCFullYear());
  const month = Number(parts.find((part) => part.type === "month")?.value ?? dayStart.getUTCMonth() + 1);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? dayStart.getUTCDate());
  const targetNoonUtc = new Date(Date.UTC(year, month - 1, day + days, 12));
  return startOfDayInTimeZone(targetNoonUtc, timeZone);
}

export function getAdminEmailCompleteDayWindows(now: Date, timeZone: string) {
  const todayStart = startOfDayInTimeZone(now, timeZone);
  const yesterdayStart = addCalendarDaysInTimeZone(todayStart, -1, timeZone);
  const trailing7dStart = addCalendarDaysInTimeZone(yesterdayStart, -6, timeZone);
  return { todayStart, yesterdayStart, trailing7dStart };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character] ?? character;
  });
}

export function renderAdminEmailDegradedSections(sections: AdminEmailDegradedSection[]) {
  if (sections.length === 0) return "";
  return `<div style="margin-top:14px;padding:12px;border-radius:10px;background:#fef3c7;border:1px solid #fde68a;color:#92400e;font-size:13px;line-height:1.5;">
    <strong>Partial report:</strong> the email was delivered, but these sections were unavailable:
    ${sections
      .map((item) => `<div>${escapeHtml(item.section)} (${escapeHtml(item.category)})</div>`)
      .join("")}
  </div>`;
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code.trim() : "";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return typeof error === "string" ? error : "";
}

export function classifyAdminEmailSectionError(error: unknown) {
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();
  if (code === "DEPENDENCY_UNAVAILABLE" || message.includes("dependency unavailable")) {
    return "dependency_unavailable";
  }
  if (code === "57014" || message.includes("statement timeout")) return "statement_timeout";
  if (message.includes("timeout") || message.includes("timed out")) return "timeout";
  if (code || message.includes("database") || message.includes("postgres")) return "database_error";
  if (message.includes("fetch") || message.includes("network")) return "network_error";
  return "unexpected_error";
}

export async function loadAdminEmailSection<T>(params: {
  section: string;
  requestId: string | null;
  load: () => Promise<T>;
  logger?: SectionLogger;
  degradedCategory?: (value: T) => string | null;
}): Promise<AdminEmailSectionResult<T>> {
  const startedAt = Date.now();
  const logger = params.logger ?? (() => undefined);
  logger({
    level: "info",
    message: "admin_dashboard_email_section_started",
    section: params.section,
    request_id: params.requestId,
  });

  try {
    const value = await params.load();
    const durationMs = Date.now() - startedAt;
    const category = params.degradedCategory?.(value) ?? null;
    logger({
      level: category ? "error" : "info",
      message: category
        ? "admin_dashboard_email_section_failed"
        : "admin_dashboard_email_section_completed",
      section: params.section,
      request_id: params.requestId,
      duration_ms: durationMs,
      ...(category ? { error_category: category } : {}),
    });
    return {
      value,
      degraded: category ? { section: params.section, category } : null,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const category = classifyAdminEmailSectionError(error);
    logger({
      level: "error",
      message: "admin_dashboard_email_section_failed",
      section: params.section,
      request_id: params.requestId,
      duration_ms: durationMs,
      error_category: category,
    });
    return {
      value: null,
      degraded: { section: params.section, category },
      durationMs,
    };
  }
}
