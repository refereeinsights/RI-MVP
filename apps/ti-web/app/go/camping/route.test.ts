import assert from "node:assert/strict";
import test from "node:test";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GET } from "./route";

const VENUE_ID = "00000000-0000-4000-8000-000000000001";
const TOURNAMENT_ID = "00000000-0000-4000-8000-000000000002";
const SESSION_ID = "00000000-0000-4000-8000-000000000003";

test("persists canonical Campspot attribution and still redirects when persistence fails", async () => {
  const originalFrom = (supabaseAdmin as any).from;
  const originalError = console.error;
  const insertedRows: Array<Record<string, unknown>> = [];
  console.error = () => {};

  (supabaseAdmin as any).from = (table: string) => {
    if (table === "venues") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: VENUE_ID, city: "Denver", state: "Colorado", latitude: 39.7392, longitude: -104.9903 },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "tournaments_public") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: TOURNAMENT_ID, slug: "summer-cup", start_date: "2099-07-10", end_date: "2099-07-12" },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "ti_outbound_clicks") {
      return {
        insert: async (payload: Record<string, unknown>) => {
          insertedRows.push(payload);
          return { error: { code: "P0001", message: "simulated persistence failure" } };
        },
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  };

  try {
    const response = await GET(
      new Request(
        `https://ti.example.test/go/camping?venue_id=${VENUE_ID}&tournament_id=${TOURNAMENT_ID}&source_surface=venue_detail&cta_placement=venue_detail_camping&session_id=${SESSION_ID}`,
        { headers: { host: "ti.example.test", "user-agent": "test-browser" } },
      ),
    );

    assert.equal(response.status, 302);
    const affiliateUrl = new URL(response.headers.get("location") ?? "");
    assert.equal(affiliateUrl.hostname, "www.awin1.com");
    assert.equal(affiliateUrl.searchParams.get("awinmid"), "22326");
    assert.equal(affiliateUrl.searchParams.get("awinaffid"), "2854179");
    assert.match(affiliateUrl.searchParams.get("clickref") ?? "", /^[0-9a-f]{32}$/);

    const inserted = insertedRows[0];
    assert.ok(inserted);
    assert.equal(inserted.destination_type, "camping");
    assert.equal(inserted.partner, "campspot");
    assert.equal(inserted.outbound_partner, "campspot");
    assert.equal(inserted.outbound_attribution_id, affiliateUrl.searchParams.get("clickref"));
    assert.equal(inserted.session_id, SESSION_ID);
    assert.equal(inserted.venue_id, VENUE_ID);
    assert.equal(inserted.tournament_id, TOURNAMENT_ID);
    assert.equal(inserted.redirect_url, affiliateUrl.toString());

    const destinationUrl = new URL(affiliateUrl.searchParams.get("ued") ?? "");
    assert.equal(destinationUrl.hostname, "www.campspot.com");
    assert.equal(destinationUrl.searchParams.get("location"), "Denver, Colorado");
    assert.equal(destinationUrl.searchParams.get("latitude"), "39.7392");
    assert.equal(destinationUrl.searchParams.get("longitude"), "-104.9903");
    assert.equal(destinationUrl.searchParams.get("checkin"), "2099-07-10");
    assert.equal(destinationUrl.searchParams.get("checkout"), "2099-07-13");
    assert.equal(inserted.target_url, destinationUrl.toString());
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    console.error = originalError;
  }
});

test("rejects an invalid optional tournament ID before querying", async () => {
  const response = await GET(
    new Request(
      `http://localhost:3001/go/camping?venue_id=${VENUE_ID}&tournament_id=not-a-uuid&source_surface=venue_map&cta_placement=venue_map_camping`,
      { headers: { host: "localhost:3001" } },
    ),
  );
  assert.equal(response.status, 400);
  assert.equal(await response.text(), "Invalid tournament_id");
});
