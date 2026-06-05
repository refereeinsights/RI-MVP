import test from "node:test";
import assert from "node:assert/strict";

import { enrichPlannerEventsWithLinkedVenue } from "./enrichVenueMetadata";

test("enrichPlannerEventsWithLinkedVenue hydrates public venues without requiring seo_slug on venues_public", async () => {
  const supabase = {
    from(table: string) {
      return {
        select() {
          return this;
        },
        in() {
          if (table === "venues_public") {
            return Promise.resolve({
              data: [
                {
                  id: "v-public",
                  name: "Avery Sports Complex",
                  address: "123 Main St",
                  city: "Spokane",
                  state: "WA",
                },
              ],
              error: null,
            });
          }
          return Promise.resolve({ data: [], error: null });
        },
      };
    },
  };

  const [event] = await enrichPlannerEventsWithLinkedVenue(supabase as any, [
    { id: "evt-1", venue_id: "v-public" },
  ]);

  assert.equal(event.linkedVenue?.id, "v-public");
  assert.equal(event.linkedVenue?.name, "Avery Sports Complex");
  assert.equal(event.linkedVenue?.seo_slug, null);
});

test("enrichPlannerEventsWithLinkedVenue falls back to venues for unresolved ids", async () => {
  const supabase = {
    from(table: string) {
      return {
        select() {
          return this;
        },
        in() {
          if (table === "venues_public") {
            return Promise.resolve({ data: [], error: null });
          }
          if (table === "venues") {
            return Promise.resolve({
              data: [
                {
                  id: "v-private",
                  name: "East Mesa Sports Complex",
                  address: "5589 Porter Dr",
                  city: "Las Cruces",
                  state: "NM",
                  seo_slug: "east-mesa-sports-complex-las-cruces",
                },
              ],
              error: null,
            });
          }
          return Promise.resolve({ data: [], error: null });
        },
      };
    },
  };

  const [event] = await enrichPlannerEventsWithLinkedVenue(supabase as any, [
    { id: "evt-2", venue_id: "v-private" },
  ]);

  assert.equal(event.linkedVenue?.id, "v-private");
  assert.equal(event.linkedVenue?.name, "East Mesa Sports Complex");
  assert.equal(event.linkedVenue?.seo_slug, "east-mesa-sports-complex-las-cruces");
});
