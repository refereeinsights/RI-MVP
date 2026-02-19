import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { geocodeAddress } from "@/lib/google/geocodeAddress";
import { timezoneFromCoordinates } from "@/lib/google/timezoneFromCoordinates";

type VenueRow = {
  id: string;
  name: string | null;
  address1: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  venue_url: string | null;
  normalized_address: string | null;
  geocode_source: string | null;
};

type VerifyResultRow = {
  id: string;
  name: string | null;
  changed_fields: string[];
};

const STATE_ABBR_BY_NAME: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeState(value: string) {
  const text = value.trim();
  if (!text) return "";
  if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase();
  const key = text.toLowerCase().replace(/\./g, "");
  return STATE_ABBR_BY_NAME[key] ?? text.toUpperCase();
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseAddressBlob(rawAddress: string) {
  const raw = rawAddress
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*(usa|united states)\.?$/i, "")
    .trim();
  if (!raw) return null;

  const commaPattern = /^(.*?),\s*([^,]+),\s*([A-Za-z]{2}|[A-Za-z .]+)\s+(\d{5}(?:-\d{4})?)$/;
  const commaMatch = raw.match(commaPattern);
  if (commaMatch) {
    const street = commaMatch[1]?.trim() ?? "";
    const city = toTitleCase(commaMatch[2]?.trim() ?? "");
    const state = normalizeState(commaMatch[3] ?? "");
    const zip = (commaMatch[4] ?? "").trim();
    if (street && city && state && zip) {
      return { street, city, state, zip };
    }
  }

  const noCommaPattern = /^(.*?)\s+([A-Za-z][A-Za-z .'-]+)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/;
  const noCommaMatch = raw.match(noCommaPattern);
  if (noCommaMatch) {
    const street = noCommaMatch[1]?.trim() ?? "";
    const city = toTitleCase(noCommaMatch[2]?.trim() ?? "");
    const state = normalizeState(noCommaMatch[3] ?? "");
    const zip = (noCommaMatch[4] ?? "").trim();
    if (street && city && state && zip) {
      return { street, city, state, zip };
    }
  }

  return null;
}

function buildFullAddress(parts: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  return [parts.street, parts.city, parts.state, parts.zip].filter(Boolean).join(", ");
}

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

async function lookupPlaceByVenueName(input: {
  name: string;
  city?: string | null;
  state?: string | null;
  apiKey: string;
}) {
  const textQuery = [input.name, input.city, input.state].filter(Boolean).join(", ");
  if (!textQuery.trim()) return null;

  const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": input.apiKey,
      "X-Goog-FieldMask":
        "places.displayName,places.websiteUri,places.formattedAddress,places.location,places.addressComponents",
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: 1,
    }),
  });

  if (!resp.ok) return null;
  const json = (await resp.json()) as {
    places?: Array<{
      websiteUri?: string;
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
    }>;
  };
  const place = json.places?.[0];
  if (!place) return null;

  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;
  for (const comp of place.addressComponents ?? []) {
    const types = comp.types ?? [];
    if (!city && (types.includes("locality") || types.includes("postal_town"))) {
      city = comp.longText ?? comp.shortText ?? null;
    }
    if (!state && types.includes("administrative_area_level_1")) {
      state = normalizeState(comp.shortText ?? comp.longText ?? "");
    }
    if (!zip && types.includes("postal_code")) {
      zip = comp.longText ?? comp.shortText ?? null;
    }
  }

  return {
    venue_url: place.websiteUri ?? null,
    formatted_address: place.formattedAddress ?? null,
    latitude: typeof place.location?.latitude === "number" ? place.location.latitude : null,
    longitude: typeof place.location?.longitude === "number" ? place.location.longitude : null,
    city: city ? toTitleCase(city) : null,
    state: state || null,
    zip: zip ?? null,
  };
}

export async function POST(request: Request) {
  const adminUser = await ensureAdminRequest();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any = {};
  try {
    payload = await request.json();
  } catch {
    // allow empty body
  }

  const limitRaw = Number(payload?.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 100;
  const dryRun = payload?.dryRun === true || payload?.dryRun === "true";
  const onlyIncomplete = payload?.onlyIncomplete === true || payload?.onlyIncomplete === "true";

  let query = supabaseAdmin
    .from("venues" as any)
    .select("id,name,address1,address,city,state,zip,latitude,longitude,timezone,venue_url,normalized_address,geocode_source")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (onlyIncomplete) {
    query = query.or(
      "city.is.null,state.is.null,zip.is.null,latitude.is.null,longitude.is.null,timezone.is.null,venue_url.is.null"
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("[venue-address-verify] fetch failed", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const venues = (data ?? []) as VenueRow[];
  const geocodeKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";

  const updated: VerifyResultRow[] = [];
  let parsedAddressCount = 0;
  let geocodedCount = 0;
  let timezoneCount = 0;
  let websiteCount = 0;

  for (const venue of venues) {
    const currentStreet = normalizeText(venue.address1) || normalizeText(venue.address);
    const parsed = parseAddressBlob(currentStreet);
    const updates: Record<string, any> = {};
    const changedFields: string[] = [];

    if (parsed) {
      const cityMissing = !normalizeText(venue.city);
      const stateMissing = !normalizeText(venue.state);
      const zipMissing = !normalizeText(venue.zip);
      const streetLooksEmbedded = currentStreet.includes(",") && Boolean(parsed.city) && Boolean(parsed.state);

      if (!normalizeText(venue.address1) || streetLooksEmbedded) {
        updates.address1 = parsed.street;
        updates.address = parsed.street;
        changedFields.push("address1");
      }
      if (cityMissing) {
        updates.city = parsed.city;
        changedFields.push("city");
      }
      if (stateMissing) {
        updates.state = parsed.state;
        changedFields.push("state");
      }
      if (zipMissing) {
        updates.zip = parsed.zip;
        changedFields.push("zip");
      }

      if (changedFields.some((f) => f === "address1" || f === "city" || f === "state" || f === "zip")) {
        parsedAddressCount += 1;
      }
    }

    const nextStreet = normalizeText(updates.address1) || currentStreet;
    const nextCity = normalizeText(updates.city) || normalizeText(venue.city);
    const nextState = normalizeText(updates.state) || normalizeText(venue.state);
    const nextZip = normalizeText(updates.zip) || normalizeText(venue.zip);
    const fullAddress = buildFullAddress({ street: nextStreet, city: nextCity, state: nextState, zip: nextZip });

    let lat = typeof venue.latitude === "number" ? venue.latitude : null;
    let lng = typeof venue.longitude === "number" ? venue.longitude : null;
    if ((lat == null || lng == null) && geocodeKey && fullAddress) {
      const geo = await geocodeAddress(fullAddress, geocodeKey);
      if (geo) {
        if (lat == null) {
          updates.latitude = geo.lat;
          lat = geo.lat;
          changedFields.push("latitude");
        }
        if (lng == null) {
          updates.longitude = geo.lng;
          lng = geo.lng;
          changedFields.push("longitude");
        }
        if (!normalizeText(venue.normalized_address) && geo.formatted_address) {
          updates.normalized_address = geo.formatted_address;
          changedFields.push("normalized_address");
        }
        updates.geocode_source = "venue_address_verify";
        if (!changedFields.includes("geocode_source")) changedFields.push("geocode_source");
        geocodedCount += 1;
      }
    }

    if (!normalizeText(venue.timezone) && geocodeKey && lat != null && lng != null) {
      const tz = await timezoneFromCoordinates(lat, lng, geocodeKey);
      if (tz) {
        updates.timezone = tz;
        timezoneCount += 1;
        changedFields.push("timezone");
      }
    }

    if (!normalizeText(venue.venue_url) && geocodeKey && normalizeText(venue.name)) {
      const place = await lookupPlaceByVenueName({
        name: normalizeText(venue.name),
        city: nextCity || null,
        state: nextState || null,
        apiKey: geocodeKey,
      });
      if (place) {
        if (place.venue_url) {
          updates.venue_url = place.venue_url;
          websiteCount += 1;
          changedFields.push("venue_url");
        }
        if (!normalizeText(venue.city) && place.city && !updates.city) {
          updates.city = place.city;
          changedFields.push("city");
        }
        if (!normalizeText(venue.state) && place.state && !updates.state) {
          updates.state = place.state;
          changedFields.push("state");
        }
        if (!normalizeText(venue.zip) && place.zip && !updates.zip) {
          updates.zip = place.zip;
          changedFields.push("zip");
        }
        if ((lat == null || lng == null) && place.latitude != null && place.longitude != null) {
          if (lat == null && !updates.latitude) {
            updates.latitude = place.latitude;
            changedFields.push("latitude");
          }
          if (lng == null && !updates.longitude) {
            updates.longitude = place.longitude;
            changedFields.push("longitude");
          }
        }
      }
    }

    const uniqueChanged = Array.from(new Set(changedFields));
    if (uniqueChanged.length === 0) continue;

    if (!dryRun) {
      const { error: updateError } = await supabaseAdmin.from("venues" as any).update(updates).eq("id", venue.id);
      if (updateError) {
        console.error("[venue-address-verify] update failed", venue.id, updateError);
        continue;
      }
    }

    updated.push({
      id: venue.id,
      name: venue.name,
      changed_fields: uniqueChanged,
    });
  }

  return NextResponse.json({
    tool: "venue_address_verify",
    dryRun,
    limit,
    scanned: venues.length,
    updated: updated.length,
    parsed_address_rows: parsedAddressCount,
    geocoded_rows: geocodedCount,
    timezone_rows: timezoneCount,
    website_rows: websiteCount,
    rows: updated.slice(0, 30),
  });
}

