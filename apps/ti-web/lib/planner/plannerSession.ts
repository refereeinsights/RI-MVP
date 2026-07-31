export type CanonicalPlannerPageType = "tournament" | "planner_entry" | "planner" | "auth" | "other";

export type PlannerSessionContext = {
  planner_session_id: string;
  experiment_name?: string | null;
  experiment_variant?: "control" | "treatment" | null;
  feature_flag_state?: "disabled" | "enabled" | null;
  tournament_id?: string | null;
  tournament_slug?: string | null;
  tournament_name?: string | null;
  tournament_start_date?: string | null;
  tournament_end_date?: string | null;
  venue_id?: string | null;
  entry_source?: string | null;
  entry_page_type?: CanonicalPlannerPageType | null;
  entry_path?: string | null;
  entry_placement?: string | null;
  current_page_type?: CanonicalPlannerPageType | null;
  current_page_path?: string | null;
  campaign_source?: string | null;
  request_source?: string | null;
  planner_auth?: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_STORAGE_PREFIX = "ti:planner-session:";

export function isPlannerSessionId(value: string | null | undefined): value is string {
  const trimmed = String(value ?? "").trim();
  return UUID_RE.test(trimmed);
}

export function normalizePlannerSessionId(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return isPlannerSessionId(trimmed) ? trimmed : null;
}

export function createPlannerSessionId() {
  return crypto.randomUUID();
}

function safeTrim(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function safeCanonicalPageType(value: string | null | undefined): CanonicalPlannerPageType | null {
  const raw = safeTrim(value);
  if (!raw) return null;
  return raw === "tournament" || raw === "planner_entry" || raw === "planner" || raw === "auth" || raw === "other"
    ? raw
    : null;
}

function safeExperimentVariant(value: string | null | undefined): "control" | "treatment" | null {
  const raw = safeTrim(value);
  if (!raw) return null;
  return raw === "control" || raw === "treatment" ? raw : null;
}

function safeFeatureFlagState(value: string | null | undefined): "disabled" | "enabled" | null {
  const raw = safeTrim(value);
  if (!raw) return null;
  return raw === "disabled" || raw === "enabled" ? raw : null;
}

type SearchParamsLike = URLSearchParams | { get(name: string): string | null };

export function parsePlannerSessionContext(input: SearchParamsLike): PlannerSessionContext | null {
  const plannerSessionId = normalizePlannerSessionId(input.get("planner_session_id"));
  if (!plannerSessionId) return null;
  return {
    planner_session_id: plannerSessionId,
    experiment_name: safeTrim(input.get("experiment_name")),
    experiment_variant: safeExperimentVariant(input.get("experiment_variant")),
    feature_flag_state: safeFeatureFlagState(input.get("feature_flag_state")),
    tournament_id: safeTrim(input.get("tournament_id")),
    tournament_slug: safeTrim(input.get("tournament_slug")),
    tournament_name: safeTrim(input.get("tournament_name")),
    tournament_start_date: safeTrim(input.get("tournament_start_date")),
    tournament_end_date: safeTrim(input.get("tournament_end_date")),
    venue_id: safeTrim(input.get("venue_id")),
    entry_source: safeTrim(input.get("entry_source")),
    entry_page_type: safeCanonicalPageType(input.get("entry_page_type")),
    entry_path: safeTrim(input.get("entry_path")),
    entry_placement: safeTrim(input.get("entry_placement")),
    current_page_type: safeCanonicalPageType(input.get("current_page_type")),
    current_page_path: safeTrim(input.get("current_page_path")),
    campaign_source: safeTrim(input.get("campaign_source")),
    request_source: safeTrim(input.get("request_source")),
    planner_auth: input.get("planner_auth") === "1",
  };
}

export function buildPlannerSessionParams(context: Partial<PlannerSessionContext>) {
  const plannerSessionId = normalizePlannerSessionId(context.planner_session_id);
  const params = new URLSearchParams();
  if (!plannerSessionId) return params;
  params.set("planner_session_id", plannerSessionId);

  const fields: Array<keyof Omit<PlannerSessionContext, "planner_session_id" | "planner_auth">> = [
    "experiment_name",
    "experiment_variant",
    "feature_flag_state",
    "tournament_id",
    "tournament_slug",
    "tournament_name",
    "tournament_start_date",
    "tournament_end_date",
    "venue_id",
    "entry_source",
    "entry_page_type",
    "entry_path",
    "entry_placement",
    "current_page_type",
    "current_page_path",
    "campaign_source",
    "request_source",
  ];

  for (const field of fields) {
    const value = safeTrim(context[field] as string | null | undefined);
    if (!value) continue;
    params.set(field, value);
  }

  if (context.planner_auth) {
    params.set("planner_auth", "1");
  }

  return params;
}

export function buildPlannerHref(pathname: string, context: Partial<PlannerSessionContext>) {
  const params = buildPlannerSessionParams(context);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

type TournamentPlannerEntryOptions = {
  planner_session_id?: string | null;
  experiment_name?: string | null;
  experiment_variant?: "control" | "treatment" | null;
  feature_flag_state?: "disabled" | "enabled" | null;
  venue_id?: string | null;
  source?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
};

export function buildTournamentPlannerEntryHref(pathname: string, options: TournamentPlannerEntryOptions) {
  const plannerSessionId = normalizePlannerSessionId(options.planner_session_id) ?? createPlannerSessionId();
  const params = new URLSearchParams();

  const experimentName = safeTrim(options.experiment_name);
  const experimentVariant = safeExperimentVariant(options.experiment_variant);
  const featureFlagState = safeFeatureFlagState(options.feature_flag_state);
  const venueId = safeTrim(options.venue_id);
  const source = safeTrim(options.source);
  const utmSource = safeTrim(options.utm_source);
  const utmMedium = safeTrim(options.utm_medium);

  if (experimentName) params.set("experiment_name", experimentName);
  if (experimentVariant) params.set("experiment_variant", experimentVariant);
  if (featureFlagState) params.set("feature_flag_state", featureFlagState);
  if (venueId) params.set("venue", venueId);
  if (source) params.set("source", source);
  if (utmSource) params.set("utm_source", utmSource);
  if (utmMedium) params.set("utm_medium", utmMedium);
  params.set("planner_session_id", plannerSessionId);

  const qs = params.toString();
  return {
    plannerSessionId,
    href: qs ? `${pathname}?${qs}` : pathname,
  };
}

export function withPlannerAuthFlag(context: Partial<PlannerSessionContext>): PlannerSessionContext | null {
  const plannerSessionId = normalizePlannerSessionId(context.planner_session_id);
  if (!plannerSessionId) return null;
  return {
    ...context,
    planner_session_id: plannerSessionId,
    planner_auth: true,
  };
}

export function wasPlannerSessionEventSeen(plannerSessionId: string, eventName: string) {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(`${SESSION_STORAGE_PREFIX}${plannerSessionId}:${eventName}`) === "1";
  } catch {
    return false;
  }
}

export function markPlannerSessionEventSeen(plannerSessionId: string, eventName: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}${plannerSessionId}:${eventName}`, "1");
  } catch {
    // ignore
  }
}
