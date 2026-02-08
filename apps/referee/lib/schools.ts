import { supabaseAdmin } from "./supabaseAdmin";
import { buildTournamentSlug } from "./tournaments/slug";

export type SchoolInput = {
  name: string;
  city: string;
  state: string;
  zip?: string | null;
  address?: string | null;
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export async function findOrCreateSchool(input: SchoolInput) {
  const name = input.name.trim();
  const city = input.city?.trim() ?? "";
  const state = input.state.trim();
  if (!name || !state) {
    throw new Error("School name and state are required.");
  }

  const slug = buildTournamentSlug({ name, city, state });

  if (input.placeId) {
    const { data: existingByPlace } = await supabaseAdmin
      .from("schools")
      .select("*")
      .eq("google_place_id", input.placeId)
      .maybeSingle();
    if (existingByPlace) return existingByPlace;
  }

  const { data: existingBySlug } = await supabaseAdmin
    .from("schools")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (existingBySlug) return existingBySlug;

  const payload = {
    name,
    city: city || null,
    state,
    slug,
    address: input.address ?? null,
    zip: input.zip ?? null,
    google_place_id: input.placeId ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
  };

  const { data, error } = await supabaseAdmin.from("schools").insert(payload).select("*").single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create school.");
  }
  return data;
}
