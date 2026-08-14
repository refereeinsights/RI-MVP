import test from "node:test";
import assert from "node:assert/strict";

import {
  persistHotelOutboundWithSnapshot,
  type HotelOutboundRepository,
  type HotelOutboundRow,
} from "./hotelOutboundPersistence";
import { STANDARD_HOTEL_PROGRAM_SNAPSHOT, hotelProgramSnapshotColumns } from "./tournamentHotelProgram";

const row: HotelOutboundRow = {
  destination_type: "hotels",
  partner: "hotelplanner",
  outbound_partner: "hotelplanner",
  outbound_attribution_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  outbound_request_id: "11111111-1111-4111-8111-111111111111",
  source_page_type: "tournament_hotels",
  source_surface: "tournament_hotels",
  cta_placement: "tournament_hotels_property",
  target_url: "https://example.test/hotel",
  redirect_url: "https://example.test/hotel",
};

function repository(input: {
  insertError?: { code?: string; message?: string } | null;
  byAttribution?: Record<string, unknown> | null;
  byRequest?: Record<string, unknown> | null;
}): HotelOutboundRepository {
  return {
    async insert() { return { error: input.insertError ?? null }; },
    async findByAttributionId() { return { data: input.byAttribution ?? null, error: null }; },
    async findByRequestId() { return { data: input.byRequest ?? null, error: null }; },
  };
}

async function quietly(run: () => Promise<string>) {
  const previous = console.error;
  console.error = () => undefined;
  try { return await run(); } finally { console.error = previous; }
}

test("inserts the immutable program snapshot with a new outbound", async () => {
  let inserted: Record<string, unknown> | null = null;
  const repo = repository({});
  repo.insert = async (value) => { inserted = value; return { error: null }; };
  assert.equal(await persistHotelOutboundWithSnapshot({ row, snapshot: STANDARD_HOTEL_PROGRAM_SNAPSHOT, repository: repo }), "inserted");
  assert.deepEqual(
    Object.fromEntries(Object.keys(hotelProgramSnapshotColumns(STANDARD_HOTEL_PROGRAM_SNAPSHOT)).map((key) => [key, inserted?.[key]])),
    hotelProgramSnapshotColumns(STANDARD_HOTEL_PROGRAM_SNAPSHOT)
  );
});

test("accepts only an exact same-row replay after either unique constraint reports 23505", async () => {
  const existing = { id: "row-1", ...row, ...hotelProgramSnapshotColumns(STANDARD_HOTEL_PROGRAM_SNAPSHOT) };
  assert.equal(await persistHotelOutboundWithSnapshot({
    row,
    snapshot: STANDARD_HOTEL_PROGRAM_SNAPSHOT,
    repository: repository({ insertError: { code: "23505" }, byAttribution: existing, byRequest: existing }),
  }), "idempotent_existing");

  assert.equal(await quietly(() => persistHotelOutboundWithSnapshot({
    row,
    snapshot: STANDARD_HOTEL_PROGRAM_SNAPSHOT,
    repository: repository({
      insertError: { code: "23505" },
      byAttribution: existing,
      byRequest: { ...existing, id: "row-2" },
    }),
  })), "conflicting_existing");
});

test("classifies legacy rows, conflicting snapshots, unresolved conflicts, and database errors", async () => {
  const legacy: Record<string, unknown> = { id: "row-1", ...row };
  for (const key of Object.keys(hotelProgramSnapshotColumns(STANDARD_HOTEL_PROGRAM_SNAPSHOT))) legacy[key] = null;
  assert.equal(await quietly(() => persistHotelOutboundWithSnapshot({
    row, snapshot: STANDARD_HOTEL_PROGRAM_SNAPSHOT,
    repository: repository({ insertError: { code: "23505" }, byAttribution: legacy, byRequest: legacy }),
  })), "legacy_existing");

  const conflicting = { id: "row-1", ...row, ...hotelProgramSnapshotColumns(STANDARD_HOTEL_PROGRAM_SNAPSHOT), hotel_program_version: "other" };
  assert.equal(await quietly(() => persistHotelOutboundWithSnapshot({
    row, snapshot: STANDARD_HOTEL_PROGRAM_SNAPSHOT,
    repository: repository({ insertError: { code: "23505" }, byAttribution: conflicting, byRequest: conflicting }),
  })), "conflicting_existing");

  assert.equal(await quietly(() => persistHotelOutboundWithSnapshot({
    row: { ...row, outbound_request_id: null }, snapshot: STANDARD_HOTEL_PROGRAM_SNAPSHOT,
    repository: repository({ insertError: { code: "23505" } }),
  })), "unresolved_conflict");

  assert.equal(await quietly(() => persistHotelOutboundWithSnapshot({
    row, snapshot: STANDARD_HOTEL_PROGRAM_SNAPSHOT,
    repository: repository({ insertError: { code: "57014" } }),
  })), "database_error");
});
