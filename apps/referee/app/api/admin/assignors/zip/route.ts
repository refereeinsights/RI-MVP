import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { lookupCityZip } from "@/lib/googlePlaces";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await requireAdmin();
  const body = await request.json().catch(() => ({}));
  const assignorId = String(body?.assignor_id ?? "").trim();
  if (!assignorId) {
    return NextResponse.json({ ok: false, error: "Missing assignor id." }, { status: 400 });
  }

  const { data: assignor, error } = await supabaseAdmin
    .from("assignors" as any)
    .select("id,display_name,base_city,base_state,zip")
    .eq("id", assignorId)
    .maybeSingle();
  if (error || !assignor) {
    return NextResponse.json({ ok: false, error: "Assignor not found." }, { status: 404 });
  }
  const assignorRow = assignor as {
    id: string;
    display_name?: string | null;
    base_city?: string | null;
    base_state?: string | null;
    zip?: string | null;
  };
  if (!assignorRow.base_city) {
    return NextResponse.json({ ok: false, error: "Assignor missing city." }, { status: 400 });
  }
  if (assignorRow.zip) {
    return NextResponse.json({ ok: true, message: "ZIP already set." });
  }

  const cityList = String(assignorRow.base_city)
    .split(",")
    .map((c) => toTitleCase(c))
    .filter(Boolean);
  const zipSet = new Set<string>();
  let zip: string | null = null;

  if (cityList.length <= 1) {
    try {
      zip = await lookupCityZip({
        city: assignorRow.base_city,
        state: assignorRow.base_state ?? null,
      });
    } catch (err: any) {
      return NextResponse.json(
        { ok: false, error: err?.message ?? "Lookup failed." },
        { status: 500 }
      );
    }
    if (zip) zipSet.add(zip);
  }

  if (!zip) {
    const { data: fallbackRows, error: fallbackErr } = await supabaseAdmin
      .from("city_zip_codes" as any)
      .select("zip")
      .in("city", cityList.length ? cityList : [toTitleCase(String(assignorRow.base_city))])
      .eq("state", String(assignorRow.base_state ?? "").trim().toUpperCase())
      .order("zip", { ascending: true });
    if (fallbackErr) {
      return NextResponse.json({ ok: false, error: "No ZIP found for city." }, { status: 404 });
    }
    (fallbackRows ?? []).forEach((row: any) => {
      if (row?.zip) zipSet.add(String(row.zip));
    });
    const fallbackFirst = (fallbackRows as any)?.[0] as { zip?: string } | undefined;
    zip = fallbackFirst?.zip ?? null;
  }

  if (!zip) {
    return NextResponse.json({ ok: false, error: "No ZIP found for city." }, { status: 404 });
  }

  const zipList = Array.from(zipSet);
  const zipRows = zipList.map((z) => ({
    assignor_id: assignorId,
    zip: z,
  }));
  if (zipRows.length) {
    const { error: zipError } = await supabaseAdmin
      .from("assignor_zip_codes" as any)
      .upsert(zipRows, { onConflict: "assignor_id,zip" });
    if (zipError) {
      return NextResponse.json({ ok: false, error: zipError.message }, { status: 500 });
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from("assignors" as any)
    .update({ zip })
    .eq("id", assignorId);
  if (updateError) {
    return NextResponse.json(
      { ok: false, error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: `ZIP updated: ${zip}`,
    zip,
    zips_added: zipRows.length,
    zips: zipList,
  });
}

function toTitleCase(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
}
