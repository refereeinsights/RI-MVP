import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PlaceResult = {
  id: string;
  name: string;
  formatted_address: string;
  lat: number | null;
  lng: number | null;
  website_uri: string | null;
};

async function ensureAdminRequest() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;
  return data.user;
}

export async function GET(request: Request) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const city = (searchParams.get("city") || "").trim();
  const state = (searchParams.get("state") || "").trim();

  if (q.length < 2) {
    return NextResponse.json({ error: "query_too_short" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "missing_places_api_key" }, { status: 500 });
  }

  const textQuery = [q, city, state].filter(Boolean).join(", ");

  try {
    const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri",
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: 5,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("[venues/places] google error", resp.status, text);
      return NextResponse.json({ error: "places_api_error", status: resp.status }, { status: 500 });
    }

    const json = (await resp.json()) as any;
    const results: PlaceResult[] =
      json?.places?.map((p: any) => ({
        id: p.id || "",
        name: p.displayName?.text || "",
        formatted_address: p.formattedAddress || "",
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
        website_uri: p.websiteUri ?? null,
      })) ?? [];

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[venues/places] fetch failed", err);
    return NextResponse.json({ error: "places_fetch_failed" }, { status: 500 });
  }
}
