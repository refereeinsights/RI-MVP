export const ANALYTICS_BATCH_MAX_EVENTS = 20;
export const ANALYTICS_BATCH_FLUSH_MS = 2_000;

export type AnalyticsEventEnvelope = {
  event: string;
  properties: Record<string, unknown>;
};

type SendOptions = {
  immediate?: boolean;
  preferBeacon?: boolean;
  dedupeKey?: string | null;
};

type AnalyticsBatcher = {
  send: (event: AnalyticsEventEnvelope, options?: SendOptions) => Promise<void>;
  flush: (preferBeacon?: boolean) => Promise<void>;
};

function safeSessionStorageGet(key: string) {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSessionStorageSet(key: string) {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, "1");
  } catch {
    // Storage can be unavailable in privacy modes. The in-memory set still deduplicates.
  }
}

export function buildAnalyticsDedupeKey(
  app: "ti" | "ri",
  event: string,
  properties: Record<string, unknown>
) {
  const pathOnly = (value: unknown) => {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      return new URL(value, typeof window !== "undefined" ? window.location.origin : "https://local.invalid").pathname;
    } catch {
      return value.split(/[?#]/, 1)[0];
    }
  };
  const context = [
    properties.planner_session_id,
    properties.tournament_id,
    properties.tournamentId,
    properties.tournament_slug,
    properties.venue_id,
    properties.venueUuid,
    properties.cta_placement,
    properties.page_type,
    properties.source_page_type,
    properties.map_list_state,
    properties.sport,
    properties.state,
    properties.month,
    properties.view,
    properties.surface,
    pathOnly(properties.page_path),
    pathOnly(properties.page_url),
    pathOnly(properties.href),
    typeof window !== "undefined" ? window.location.pathname : null,
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join("|")
    .slice(0, 800);

  return `analytics:${app}:v1:${event}:${context || "global"}`;
}

export function isRepeatableViewEvent(event: string) {
  const normalized = event.trim().toLowerCase();
  return (
    normalized.endsWith("_viewed") ||
    normalized.endsWith("_impression") ||
    normalized.endsWith("_loaded") ||
    normalized.endsWith(" opened")
  );
}

export function normalizeAnalyticsRequestBody(value: unknown): AnalyticsEventEnvelope[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const candidates = Array.isArray(body.events) ? body.events : [body];
  if (candidates.length < 1 || candidates.length > ANALYTICS_BATCH_MAX_EVENTS) return null;

  const events: AnalyticsEventEnvelope[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const record = candidate as Record<string, unknown>;
    if (typeof record.event !== "string" || !record.event.trim()) return null;
    if (record.properties !== undefined) {
      if (!record.properties || typeof record.properties !== "object" || Array.isArray(record.properties)) return null;
    }
    events.push({
      event: record.event,
      properties: (record.properties ?? {}) as Record<string, unknown>,
    });
  }
  return events;
}

export function createAnalyticsBatcher(endpoint = "/api/analytics"): AnalyticsBatcher {
  let queue: AnalyticsEventEnvelope[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let listenersRegistered = false;
  const memoryDedupe = new Set<string>();

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function transmit(events: AnalyticsEventEnvelope[], preferBeacon: boolean) {
    if (!events.length) return Promise.resolve();
    const body = JSON.stringify(events.length === 1 ? events[0] : { events });
    if (preferBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const accepted = navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      if (accepted) return Promise.resolve();
    }
    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).then(() => undefined);
  }

  async function flush(preferBeacon = false) {
    clearTimer();
    const events = queue.splice(0, ANALYTICS_BATCH_MAX_EVENTS);
    if (!events.length) return;
    try {
      await transmit(events, preferBeacon);
    } catch {
      // Product interactions must never be blocked or retried in a tight loop by analytics.
    }
    if (queue.length) {
      if (preferBeacon) void flush(true);
      else if (!timer) timer = setTimeout(() => void flush(), ANALYTICS_BATCH_FLUSH_MS);
    }
  }

  function registerFlushListeners() {
    if (listenersRegistered || typeof window === "undefined" || typeof document === "undefined") return;
    listenersRegistered = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flush(true);
    });
    window.addEventListener("pagehide", () => void flush(true));
  }

  async function send(event: AnalyticsEventEnvelope, options: SendOptions = {}) {
    if (options.dedupeKey) {
      if (memoryDedupe.has(options.dedupeKey) || safeSessionStorageGet(options.dedupeKey) === "1") return;
      memoryDedupe.add(options.dedupeKey);
      safeSessionStorageSet(options.dedupeKey);
    }

    if (options.immediate || options.preferBeacon) {
      // Preserve funnel ordering: flush earlier queued impressions/views before
      // sending a terminal conversion or page-exit event.
      if (queue.length) await flush(Boolean(options.preferBeacon));
      try {
        await transmit([event], Boolean(options.preferBeacon));
      } catch {
        // Analytics must fail open.
      }
      return;
    }

    registerFlushListeners();
    queue.push(event);
    if (queue.length >= ANALYTICS_BATCH_MAX_EVENTS) {
      await flush();
      return;
    }
    if (!timer) timer = setTimeout(() => void flush(), ANALYTICS_BATCH_FLUSH_MS);
  }

  return { send, flush };
}
