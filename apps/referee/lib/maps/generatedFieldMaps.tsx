import crypto from "crypto";
import { ImageResponse } from "next/og.js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { EXTERNAL_API, EXTERNAL_API_SURFACE, trackExternalCall } from "@/lib/trackExternalCall";

export type GeneratedMapVenue = {
  venue_id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  latitude: number;
  longitude: number;
};

export type GenerateMapOpts = {
  width?: number;
  height?: number;
  zoom?: number;
  style?: string; // Mapbox style id path, e.g. "mapbox/satellite-streets-v12"
  dateOverride?: string; // YYYY-MM-DD
  centerLatitude?: number;
  centerLongitude?: number;
  includeSunPathOverlay?: boolean;
};

export function sha256Hex(bytes: Uint8Array) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function buildMapboxStaticUrl(params: {
  latitude: number;
  longitude: number;
  width: number;
  height: number;
  zoom: number;
  style: string;
}) {
  const token = String(process.env.MAPBOX_ACCESS_TOKEN || "").trim();
  if (!token) throw new Error("missing_mapbox_access_token");

  const { latitude, longitude, width, height, zoom, style } = params;
  const lon = longitude;
  const lat = latitude;

  const safeZoom = clamp(Number(zoom) || 16, 0, 22);
  const safeW = clamp(Number(width) || 1024, 200, 1280);
  const safeH = clamp(Number(height) || 768, 200, 1280);
  const safeStyle = String(style || "mapbox/satellite-streets-v12").trim();

  // Mapbox Static Images API
  // https://api.mapbox.com/styles/v1/{username}/{style_id}/static/{lon},{lat},{zoom},{bearing},{pitch}/{width}x{height}?access_token=...
  const url = new URL(`https://api.mapbox.com/styles/v1/${safeStyle}/static/${lon},${lat},${safeZoom},0,0/${safeW}x${safeH}`);
  url.searchParams.set("access_token", token);
  return url.toString();
}

function formatDateYYYYMMDD(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export async function fetchMapboxStaticPng(params: {
  latitude: number;
  longitude: number;
  width: number;
  height: number;
  zoom: number;
  style: string;
}) {
  const url = buildMapboxStaticUrl(params);
  const res = await trackExternalCall(EXTERNAL_API.mapbox, "static_map", EXTERNAL_API_SURFACE.venue_field_map, () => fetch(url, { cache: "no-store" }));
  if (!res.ok) {
    throw new Error(`mapbox_static_http_${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return new Uint8Array(buf);
}

export async function renderGeneratedMapPng(
  venue: GeneratedMapVenue,
  opts?: GenerateMapOpts
): Promise<{ bytes: Uint8Array; dateStamp: string }> {
  const width = opts?.width ?? 1024;
  const height = opts?.height ?? 768;
  const zoom = opts?.zoom ?? 16;
  const style = opts?.style ?? "mapbox/satellite-streets-v12";
  const dateStamp = (opts?.dateOverride ?? "").trim() || formatDateYYYYMMDD(new Date());
  const enableSunPathEnv = String(process.env.ENABLE_SUN_PATH_OVERLAY ?? "").trim().toLowerCase() === "true";
  const hasSunPathOverlay = Boolean(opts?.includeSunPathOverlay ?? enableSunPathEnv);

  // Use the Static Images URL directly as the <img> source.
  // In practice, next/og's renderer is more reliable with remote image URLs than large base64 data URLs.
  const baseUrl = buildMapboxStaticUrl({
    latitude: opts?.centerLatitude ?? venue.latitude,
    longitude: opts?.centerLongitude ?? venue.longitude,
    width,
    height,
    zoom,
    style,
  });

  const title = venue.name.trim();
  const address1 = String(venue.address ?? "").trim() || null;
  const address2 = [venue.city, venue.state, venue.zip].filter(Boolean).join(", ").trim() || null;

  // Footer: keep the warning prominent, and include attribution + date (no duplication).
  const footerLine1 = "Generated map (approximate) • Not an official venue map";
  const footerLine2 = `TournamentInsights • © Mapbox © OpenStreetMap • ${dateStamp}`;

  const response = new ImageResponse(
    (
      <div style={{ width, height, position: "relative", display: "flex", background: "#000" }}>
        <img src={baseUrl} width={width} height={height} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />

        {/* North arrow (top-right) */}
        <div
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "rgba(255,255,255,0.88)",
            border: "1px solid rgba(15,23,42,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a", lineHeight: 1 }}>N</div>
          <div
            style={{
              marginTop: 2,
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderBottom: "12px solid #0f172a",
            }}
          />
        </div>

        {/* Header (top-left): title + address */}
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            maxWidth: 440,
            padding: "9px 11px",
            borderRadius: 14,
            background: "rgba(15,23,42,0.72)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.14)",
            display: "flex",
            flexDirection: "column",
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 950, lineHeight: 1.15 }}>{title}</div>
          {address1 ? <div style={{ marginTop: 4, fontSize: 11, opacity: 0.92, lineHeight: 1.2 }}>{address1}</div> : null}
          {address2 ? <div style={{ marginTop: 2, fontSize: 11, opacity: 0.88, lineHeight: 1.2 }}>{address2}</div> : null}

          {/* Optional: approximate sun path guidance (subtle, non-predictive) */}
          {hasSunPathOverlay ? (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.92 }}>Afternoon Sun ←</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="4.3" fill="rgba(255,215,0,0.9)" />
                    <path
                      d="M12 2.2v3.1M12 18.7v3.1M2.2 12h3.1M18.7 12h3.1M4.5 4.5l2.2 2.2M17.3 17.3l2.2 2.2M19.5 4.5l-2.2 2.2M6.7 17.3l-2.2 2.2"
                      stroke="rgba(255,215,0,0.85)"
                      stroke-width="2"
                      stroke-linecap="round"
                    />
                  </svg>
                  <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.92 }}>Morning Sun</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="260" height="26" viewBox="0 0 260 26">
                  <path
                    d="M 246 20 C 190 4, 70 4, 14 20"
                    fill="none"
                    stroke="rgba(255,215,0,0.55)"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                  <path
                    d="M 14 20 L 23 15 M 14 20 L 23 25"
                    fill="none"
                    stroke="rgba(255,215,0,0.55)"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 10, opacity: 0.9, color: "rgba(255,215,0,0.95)" }}>Approx. Sun Path</div>
                <div style={{ fontSize: 10, opacity: 0.86 }}>Varies by season</div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer warning + attribution */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "10px 14px",
            background: "rgba(0,0,0,0.62)",
            color: "#fff",
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 950, lineHeight: 1.2 }}>{footerLine1}</div>
          <div style={{ fontSize: 10, opacity: 0.92, lineHeight: 1.2 }}>{footerLine2}</div>
        </div>
      </div>
    ),
    { width, height }
  );

  const out = new Uint8Array(Buffer.from(await response.arrayBuffer()));
  return { bytes: out, dateStamp };
}

export async function uploadGeneratedMapToStorage(params: {
  bytes: Uint8Array;
  venueId: string;
  hashHex: string;
  dateStamp: string;
  bucket?: string;
}) {
  const bucket = (params.bucket ?? process.env.SUPABASE_VENUE_MAPS_BUCKET ?? "venue-maps").trim();
  const objectPath = `generated/${params.venueId}/${params.dateStamp}/${params.hashHex}.png`;

  const res = await supabaseAdmin.storage.from(bucket).upload(objectPath, params.bytes, {
    contentType: "image/png",
    upsert: false,
    cacheControl: "3600",
  });

  if (res.error) {
    // If the object already exists, treat as success and return existing path/url.
    // Supabase error shape varies; handle common cases.
    const statusCode = (res.error as any)?.statusCode ?? (res.error as any)?.status ?? null;
    const msg = String((res.error as any)?.message ?? "");
    const alreadyExists = statusCode === 409 || /already exists/i.test(msg);
    if (!alreadyExists) throw new Error(`storage_upload_failed:${msg || "unknown"}`);
  }

  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(objectPath);
  const publicUrl = data.publicUrl;

  return { bucket, objectPath, publicUrl };
}
