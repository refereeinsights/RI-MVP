import { createClient } from "@supabase/supabase-js";

async function main() {
  const apply = process.argv.includes("--apply");
  const patternArg = process.argv.find((arg) => arg.startsWith("--pattern="));
  const pattern = (patternArg ? patternArg.slice("--pattern=".length) : "%1529%3rd%").trim();
  const patterns = [pattern, pattern === "%1529%3rd%" ? "%1529%third%" : ""].filter(Boolean);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let venueCount = 0;
  let attrCount = 0;
  for (const pat of patterns) {
    const countVenue = await supabase
      .from("tournament_venue_candidates")
      .select("id", { count: "exact", head: true })
      .ilike("address_text", pat)
      .is("accepted_at", null)
      .is("rejected_at", null);
    if (countVenue.error) throw countVenue.error;
    venueCount += countVenue.count ?? 0;

    const countAttr = await supabase
      .from("tournament_attribute_candidates")
      .select("id", { count: "exact", head: true })
      .eq("attribute_key", "address")
      .ilike("attribute_value", pat)
      .is("accepted_at", null)
      .is("rejected_at", null);
    if (countAttr.error) throw countAttr.error;
    attrCount += countAttr.count ?? 0;
  }

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          apply,
          patterns,
          tournament_venue_candidates: venueCount,
          tournament_attribute_candidates_address: attrCount,
        },
        null,
        2
      )
    );
    return;
  }

  let venueDeleted = 0;
  let attrDeleted = 0;
  for (const pat of patterns) {
    const delVenue = await supabase
      .from("tournament_venue_candidates")
      .delete({ count: "exact" })
      .ilike("address_text", pat)
      .is("accepted_at", null)
      .is("rejected_at", null);
    if (delVenue.error) throw delVenue.error;
    venueDeleted += delVenue.count ?? 0;

    const delAttr = await supabase
      .from("tournament_attribute_candidates")
      .delete({ count: "exact" })
      .eq("attribute_key", "address")
      .ilike("attribute_value", pat)
      .is("accepted_at", null)
      .is("rejected_at", null);
    if (delAttr.error) throw delAttr.error;
    attrDeleted += delAttr.count ?? 0;
  }

  console.log(
    JSON.stringify(
      {
        apply,
        patterns,
        deleted_tournament_venue_candidates: venueDeleted,
        deleted_tournament_attribute_candidates_address: attrDeleted,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
