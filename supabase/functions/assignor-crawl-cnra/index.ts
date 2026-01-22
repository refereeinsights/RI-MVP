import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

type CrawlRequest = {
  zip: string;
  radius_miles: number;
  source_id?: string | null;
  cookie?: string | null;
};

type Bounds = {
  nw: { lat: number; lng: number };
  se: { lat: number; lng: number };
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isValidZip(zip: string) {
  return /^\d{5}$/.test(zip);
}

function clampRadius(radius: number) {
  if (!Number.isFinite(radius)) return null;
  if (radius < 1 || radius > 200) return null;
  return radius;
}

function computeBounds(lat: number, lng: number, radiusMiles: number): Bounds {
  const latDelta = radiusMiles / 69;
  const lngDelta = radiusMiles / (Math.cos((lat * Math.PI) / 180) * 69);
  return {
    nw: { lat: lat + latDelta, lng: lng - lngDelta },
    se: { lat: lat - latDelta, lng: lng + lngDelta },
  };
}

function extractNonce(html: string): string | null {
  const patterns = [
    /nonce["']?\s*[:=]\s*["']([a-f0-9]{10,})["']/i,
    /"nonce"\s*:\s*"([a-f0-9]{10,})"/i,
    /nonce\s*=\s*"([a-f0-9]{10,})"/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function pickString(obj: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function extractRecords(payload: any) {
  if (Array.isArray(payload)) return payload;
  if (!payload) return [];
  const candidates = [
    payload.stores,
    payload.results,
    payload.locations,
    payload.items,
    payload.data,
    payload.data?.stores,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, { error: "Missing Supabase credentials" });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  if (authHeader !== expected) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  let input: CrawlRequest | null = null;
  try {
    input = (await req.json()) as CrawlRequest;
  } catch (_err) {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const zip = String(input?.zip ?? "").trim();
  const radiusValue = clampRadius(Number(input?.radius_miles));
  if (!isValidZip(zip) || radiusValue === null) {
    return jsonResponse(400, { error: "Invalid zip or radius" });
  }

  const cookie = input?.cookie ? String(input.cookie) : null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const zipRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!zipRes.ok) {
    return jsonResponse(400, { error: "Unable to resolve zip" });
  }
  const zipData = await zipRes.json();
  const place = zipData?.places?.[0];
  const lat = Number(place?.latitude);
  const lng = Number(place?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonResponse(400, { error: "Zip lookup missing coordinates" });
  }

  let sourceId = input?.source_id ? String(input.source_id) : null;
  if (!sourceId) {
    const { data: sourceRow, error: sourceError } = await supabase
      .from("assignor_sources")
      .select("id")
      .eq("source_url", "https://www.cnra.net/assignor/")
      .maybeSingle();
    if (sourceError || !sourceRow?.id) {
      return jsonResponse(500, { error: "CNRA source not found" });
    }
    sourceId = sourceRow.id;
  }

  const bounds = computeBounds(lat, lng, radiusValue);
  const queryText = `zip=${zip} radius=${radiusValue}`;
  const queryPayload = {
    zip,
    radius_miles: radiusValue,
    lat,
    lng,
    nw: bounds.nw,
    se: bounds.se,
  };

  const { data: crawlRun, error: crawlRunError } = await supabase
    .from("assignor_crawl_runs")
    .insert({
      source_id: sourceId,
      query_text: queryText,
      query_payload: queryPayload,
      status: "running",
    })
    .select("id")
    .single();

  if (crawlRunError || !crawlRun?.id) {
    return jsonResponse(500, { error: "Failed to create crawl run" });
  }

  const crawlRunId = crawlRun.id as string;
  const failRun = async (message: string) => {
    await supabase
      .from("assignor_crawl_runs")
      .update({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", crawlRunId);
  };

  const pageHeaders: Record<string, string> = {};
  if (cookie) pageHeaders.cookie = cookie;
  const pageRes = await fetch("https://www.cnra.net/assignor/", {
    headers: pageHeaders,
  });
  if (!pageRes.ok) {
    await failRun("Failed to load CNRA page");
    return jsonResponse(502, { error: "Failed to load CNRA page" });
  }
  const html = await pageRes.text();
  const nonce = extractNonce(html);
  if (!nonce) {
    await failRun("Nonce not found");
    return jsonResponse(500, { error: "Nonce not found" });
  }

  const ajaxUrl = new URL("https://www.cnra.net/wp-admin/admin-ajax.php");
  ajaxUrl.searchParams.set("action", "asl_load_stores");
  ajaxUrl.searchParams.set("nonce", nonce);
  ajaxUrl.searchParams.set("load_all", "0");
  ajaxUrl.searchParams.set("layout", "1");
  ajaxUrl.searchParams.set("lat", String(lat));
  ajaxUrl.searchParams.set("lng", String(lng));
  ajaxUrl.searchParams.append("nw[]", String(bounds.nw.lat));
  ajaxUrl.searchParams.append("nw[]", String(bounds.nw.lng));
  ajaxUrl.searchParams.append("se[]", String(bounds.se.lat));
  ajaxUrl.searchParams.append("se[]", String(bounds.se.lng));

  const headers: Record<string, string> = {
    accept: "application/json, text/javascript, */*; q=0.01",
    "x-requested-with": "XMLHttpRequest",
    referer: "https://www.cnra.net/assignor/",
  };
  if (cookie) headers.cookie = cookie;

  const ajaxRes = await fetch(ajaxUrl.toString(), { headers });
  if (!ajaxRes.ok) {
    await failRun(`CNRA ajax error ${ajaxRes.status}`);
    return jsonResponse(502, { error: "CNRA ajax request failed" });
  }

  let payload: any = null;
  try {
    payload = await ajaxRes.json();
  } catch (_err) {
    await failRun("CNRA ajax response not JSON");
    return jsonResponse(502, { error: "CNRA response not JSON" });
  }

  const records = extractRecords(payload);
  if (!Array.isArray(records)) {
    await failRun("CNRA payload missing records");
    return jsonResponse(500, { error: "CNRA payload missing records" });
  }

  const withExternal: any[] = [];
  const withoutExternal: any[] = [];

  for (const item of records) {
    const name = pickString(item, ["name", "title", "store", "location_name", "assignor", "display_name", "label"]);
    const email = pickString(item, ["email", "email_address", "contact_email", "email1"]);
    const phone = pickString(item, ["phone", "phone1", "phone_number", "contact_phone", "mobile"]);
    const city = pickString(item, ["city", "town", "locality"]);
    const state = pickString(item, ["state", "province", "region"]) ?? "CA";
    const org = pickString(item, ["organization", "org", "org_name", "club", "association"]) ?? "CNRA";
    const externalId =
      item?.id ?? item?.store_id ?? item?.location_id ?? item?.post_id ?? null;

    const raw = {
      name,
      email,
      phone,
      city,
      state,
      sport: "soccer",
      organization: org,
      source_url: "https://www.cnra.net/assignor/",
      query_zip: zip,
      lat,
      lng,
      cnra: item,
    };

    const row = {
      source_id: sourceId,
      crawl_run_id: crawlRunId,
      external_id: externalId ? String(externalId) : null,
      raw,
      confidence: 80,
      review_status: "needs_review",
    };

    if (row.external_id) {
      withExternal.push(row);
    } else {
      withoutExternal.push(row);
    }
  }

  if (withExternal.length) {
    const { error: upsertError } = await supabase
      .from("assignor_source_records")
      .upsert(withExternal, { onConflict: "source_id,external_id" });
    if (upsertError) {
      const msg = String(upsertError.message || "");
      const code = (upsertError as any)?.code;
      const conflictMissing =
        code === "42P10" || msg.includes("no unique") || msg.includes("ON CONFLICT");
      if (conflictMissing) {
        const { error: insertFallback } = await supabase
          .from("assignor_source_records")
          .insert(withExternal);
        if (insertFallback) {
          await failRun("Failed to insert records (fallback)");
          return jsonResponse(500, { error: "Failed to insert records" });
        }
      } else {
        await failRun("Failed to upsert records");
        return jsonResponse(500, { error: "Failed to upsert records" });
      }
    }
  }

  if (withoutExternal.length) {
    const { error: insertError } = await supabase
      .from("assignor_source_records")
      .insert(withoutExternal);
    if (insertError) {
      await failRun("Failed to insert records");
      return jsonResponse(500, { error: "Failed to insert records" });
    }
  }

  await supabase
    .from("assignor_crawl_runs")
    .update({
      status: "success",
      finished_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", crawlRunId);

  const inserted = withExternal.length + withoutExternal.length;
  return jsonResponse(200, {
    status: "success",
    crawl_run_id: crawlRunId,
    inserted,
    zip,
    radius_miles: radiusValue,
  });
});
