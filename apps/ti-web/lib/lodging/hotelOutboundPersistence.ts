import {
  hotelProgramSnapshotColumns,
  type HotelProgramSnapshot,
} from "./tournamentHotelProgram";

export type HotelOutboundPersistenceResult =
  | "inserted"
  | "idempotent_existing"
  | "conflicting_existing"
  | "legacy_existing"
  | "unresolved_conflict"
  | "database_error";

type DatabaseError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

export type HotelOutboundRow = Record<string, unknown> & {
  destination_type: "hotels";
  partner: "hotelplanner";
  outbound_partner: "hotelplanner";
  outbound_attribution_id: string;
  outbound_request_id?: string | null;
};

export type HotelOutboundRepository = {
  insert(row: Record<string, unknown>): Promise<{ error: DatabaseError | null }>;
  findByAttributionId(id: string): Promise<{ data: Record<string, unknown> | null; error: DatabaseError | null }>;
  findByRequestId(id: string): Promise<{ data: Record<string, unknown> | null; error: DatabaseError | null }>;
};

const SNAPSHOT_KEYS = [
  "hotel_program_type",
  "hotel_program_rate_cents",
  "hotel_program_beneficiary_type",
  "hotel_program_beneficiary_id",
  "hotel_program_version",
] as const;

const IMMUTABLE_CONTEXT_KEYS = [
  "destination_type",
  "partner",
  "outbound_partner",
  "outbound_attribution_id",
  "outbound_request_id",
  "tournament_id",
  "tournament_slug",
  "venue_id",
  "source_page_type",
  "source_surface",
  "cta_placement",
  "job_code",
  "custom_field1",
  "custom_field2",
  "custom_field3",
  "custom_field4",
  "custom_field5",
  "custom_field6",
  "custom_field7",
  "custom_field8",
  "target_url",
  "redirect_url",
] as const;

const RECONCILIATION_SELECT = ["id", ...SNAPSHOT_KEYS, ...IMMUTABLE_CONTEXT_KEYS].join(",");

function normalizeNull(value: unknown) {
  return value === undefined ? null : value;
}

function fieldsMatch(
  existing: Record<string, unknown>,
  expected: Record<string, unknown>,
  keys: readonly string[]
) {
  return keys.every((key) => Object.is(normalizeNull(existing[key]), normalizeNull(expected[key])));
}

function isLegacySnapshot(row: Record<string, unknown>) {
  return SNAPSHOT_KEYS.every((key) => normalizeNull(row[key]) === null);
}

function safeConstraintName(error: DatabaseError | null) {
  const combined = `${error?.details ?? ""} ${error?.message ?? ""}`;
  const match = combined.match(/ti_outbound_clicks_[a-z0-9_]+(?:uidx|key)/i);
  return match?.[0] ?? null;
}

function logPersistenceIssue(
  message: string,
  row: HotelOutboundRow,
  snapshot: HotelProgramSnapshot,
  result: Exclude<HotelOutboundPersistenceResult, "inserted" | "idempotent_existing">,
  error?: DatabaseError | null
) {
  console.error(`[hotel-outbound] ${message}`, {
    result,
    error_code: error?.code ?? null,
    constraint: safeConstraintName(error ?? null),
    outbound_attribution_id: row.outbound_attribution_id,
    outbound_request_id: normalizeNull(row.outbound_request_id),
    program_type: snapshot.programType,
    source: normalizeNull(row.source_page_type ?? row.source_surface),
    placement: normalizeNull(row.cta_placement),
  });
}

function createSupabaseRepository(): HotelOutboundRepository {
  return {
    async insert(row) {
      const { supabaseAdmin } = await import("../supabaseAdmin");
      const { error } = await supabaseAdmin.from("ti_outbound_clicks" as any).insert(row);
      return { error: error as DatabaseError | null };
    },
    async findByAttributionId(id) {
      const { supabaseAdmin } = await import("../supabaseAdmin");
      const { data, error } = await supabaseAdmin
        .from("ti_outbound_clicks" as any)
        .select(RECONCILIATION_SELECT)
        .eq("outbound_attribution_id", id)
        .maybeSingle();
      return { data: data as Record<string, unknown> | null, error: error as DatabaseError | null };
    },
    async findByRequestId(id) {
      const { supabaseAdmin } = await import("../supabaseAdmin");
      const { data, error } = await supabaseAdmin
        .from("ti_outbound_clicks" as any)
        .select(RECONCILIATION_SELECT)
        .eq("outbound_request_id", id)
        .maybeSingle();
      return { data: data as Record<string, unknown> | null, error: error as DatabaseError | null };
    },
  };
}

export function isHotelOutboundPersistenceSuccess(result: HotelOutboundPersistenceResult) {
  return result === "inserted" || result === "idempotent_existing";
}

export async function persistHotelOutboundWithSnapshot(input: {
  row: HotelOutboundRow;
  snapshot: HotelProgramSnapshot;
  repository?: HotelOutboundRepository;
}): Promise<HotelOutboundPersistenceResult> {
  const repository = input.repository ?? createSupabaseRepository();
  const snapshotColumns = hotelProgramSnapshotColumns(input.snapshot);
  const rowWithSnapshot = { ...input.row, ...snapshotColumns };

  try {
    const inserted = await repository.insert(rowWithSnapshot);
    if (!inserted.error) return "inserted";
    if (inserted.error.code !== "23505") {
      logPersistenceIssue("insert failed", input.row, input.snapshot, "database_error", inserted.error);
      return "database_error";
    }

    const byAttribution = await repository.findByAttributionId(input.row.outbound_attribution_id);
    const requestId = typeof input.row.outbound_request_id === "string" ? input.row.outbound_request_id : null;
    const byRequest = requestId ? await repository.findByRequestId(requestId) : null;
    if (byAttribution.error || byRequest?.error) {
      logPersistenceIssue(
        "conflict lookup failed",
        input.row,
        input.snapshot,
        "database_error",
        byAttribution.error ?? byRequest?.error
      );
      return "database_error";
    }

    const attributionRow = byAttribution.data;
    const requestRow = byRequest?.data ?? null;
    if (requestId) {
      if (!attributionRow || !requestRow || attributionRow.id !== requestRow.id) {
        logPersistenceIssue("identifiers conflict", input.row, input.snapshot, "conflicting_existing", inserted.error);
        return "conflicting_existing";
      }
    } else if (!attributionRow) {
      logPersistenceIssue("conflict could not be resolved", input.row, input.snapshot, "unresolved_conflict", inserted.error);
      return "unresolved_conflict";
    }

    const existing = attributionRow ?? requestRow;
    if (!existing) {
      logPersistenceIssue("conflict could not be resolved", input.row, input.snapshot, "unresolved_conflict", inserted.error);
      return "unresolved_conflict";
    }
    if (isLegacySnapshot(existing)) {
      logPersistenceIssue("legacy row cannot receive a snapshot", input.row, input.snapshot, "legacy_existing", inserted.error);
      return "legacy_existing";
    }
    if (!fieldsMatch(existing, snapshotColumns, SNAPSHOT_KEYS) || !fieldsMatch(existing, rowWithSnapshot, IMMUTABLE_CONTEXT_KEYS)) {
      logPersistenceIssue("immutable context conflicts", input.row, input.snapshot, "conflicting_existing", inserted.error);
      return "conflicting_existing";
    }
    return "idempotent_existing";
  } catch (error) {
    logPersistenceIssue("unexpected persistence error", input.row, input.snapshot, "database_error", {
      message: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
    return "database_error";
  }
}
