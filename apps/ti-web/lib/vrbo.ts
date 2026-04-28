export type VrboSearchInput = {
  destination: string | null;
  latitude?: number | null;
  longitude?: number | null;
  checkin?: string | null; // YYYY-MM-DD
  checkout?: string | null; // YYYY-MM-DD
  adults?: number | null;
};

function isValidIsoDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, m, d] = raw.split("-").map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(dt.getTime())) return false;
  return dt.toISOString().slice(0, 10) === raw;
}

function addDaysIso(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function compareIso(a: string, b: string) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function todayUtcIso() {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return todayUtc.toISOString().slice(0, 10);
}

export function buildVrboSearchUrl(input: VrboSearchInput) {
  const base = new URL("https://www.vrbo.com/search");

  const destination = String(input.destination ?? "").trim();
  if (destination) base.searchParams.set("destination", destination);

  const lat = typeof input.latitude === "number" ? input.latitude : null;
  const lng = typeof input.longitude === "number" ? input.longitude : null;
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    base.searchParams.set("latLong", `${lat},${lng}`);
  }

  const adults = Math.max(1, Math.min(12, Math.floor(input.adults ?? 2)));
  base.searchParams.set("adults", String(adults));
  base.searchParams.set("flexibility", "0_DAY");

  const checkin = isValidIsoDate(input.checkin) ? String(input.checkin) : null;
  const checkout = isValidIsoDate(input.checkout) ? String(input.checkout) : null;
  if (checkin && checkout) {
    const today = todayUtcIso();
    if (compareIso(checkin, today) >= 0) {
      const safeCheckout = compareIso(checkout, checkin) <= 0 ? addDaysIso(checkin, 1) : checkout;
      if (compareIso(safeCheckout, checkin) > 0) {
        base.searchParams.set("d1", checkin);
        base.searchParams.set("startDate", checkin);
        base.searchParams.set("d2", safeCheckout);
        base.searchParams.set("endDate", safeCheckout);
      }
    }
  }

  return base.toString();
}

export function buildCjVrboUrl(vrboUrl: string) {
  const publisherId = process.env.VRBO_CJ_PUBLISHER_ID;
  const linkId = process.env.VRBO_CJ_LINK_ID;
  const base = process.env.VRBO_CJ_BASE_URL || "https://www.anrdoezrs.net/click";
  if (!publisherId || !linkId) return { ok: false as const, error: "Missing VRBO_CJ_PUBLISHER_ID or VRBO_CJ_LINK_ID" };

  const cj = `${base}-${encodeURIComponent(publisherId)}-${encodeURIComponent(linkId)}?url=${encodeURIComponent(vrboUrl)}`;
  return { ok: true as const, url: cj };
}

