#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const argv = process.argv.slice(2);

function getArg(name, fallback = null) {
  const prefix = `--${name}`;
  const idx = argv.findIndex((value) => value === prefix || value.startsWith(`${prefix}=`));
  if (idx === -1) return fallback;
  const raw = argv[idx];
  if (raw.includes("=")) return raw.split("=", 2)[1] ?? fallback;
  const next = argv[idx + 1];
  if (!next || next.startsWith("--")) return fallback;
  return next;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    out[key] = value;
  }
  return out;
}

function requireEnv(env, key) {
  const value = String(env[key] ?? "").trim();
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

function buildAuthorizationToken({ apiKey, secretKey, accountId }, epoch) {
  const apiKeyEncoded = Buffer.from(apiKey).toString("base64url");
  const signatureInput = `${apiKeyEncoded}|${accountId}|${epoch}`;
  const signature = crypto.createHmac("sha256", secretKey).update(signatureInput).digest("base64url");
  return `${apiKeyEncoded}.${signature}`;
}

function collectInterestingFields(value, prefix = "", out = []) {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectInterestingFields(entry, `${prefix}[${index}]`, out));
    return out;
  }
  for (const [key, entry] of Object.entries(value)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    if (/(book|reserve|checkout|deeplink|deep_link|link|url|href|token|code|id|rateplan|ratePlan|roomType)/i.test(fieldPath)) {
      out.push([fieldPath, entry]);
    }
    collectInterestingFields(entry, fieldPath, out);
  }
  return out;
}

function safeKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value).sort();
}

async function main() {
  const envPath = getArg("env", "apps/ti-web/.env.local");
  const env = {
    ...process.env,
    ...parseEnvFile(path.resolve(envPath)),
  };

  const propertyId = String(getArg("property-id", "")).trim();
  if (!propertyId) {
    throw new Error("Missing --property-id");
  }

  const hotelIDTypeIDRaw = getArg("hotel-id-type-id", "0");
  const hotelIDTypeID = Number(hotelIDTypeIDRaw);
  const checkIn = String(getArg("checkin", "")).trim();
  const checkOut = String(getArg("checkout", "")).trim();
  if (!checkIn || !checkOut) {
    throw new Error("Missing --checkin or --checkout (expected mm/dd/yyyy)");
  }

  const config = {
    apiKey: requireEnv(env, "HOTELPLANNER_API_KEY"),
    secretKey: requireEnv(env, "HOTELPLANNER_SECRET_KEY"),
    accountId: requireEnv(env, "HOTELPLANNER_ACCOUNT_ID"),
    siteId: requireEnv(env, "HOTELPLANNER_SITE_ID"),
    baseUrl: String(env.HOTELPLANNER_BASE_URL || "https://api.hotelplanner.com/hpapi/v2.3/").trim(),
  };

  const epoch = Math.floor(Date.now() / 1000);
  const url = new URL(config.baseUrl);
  url.searchParams.set("method", "propertyAvailability");
  url.searchParams.set("epoch", String(epoch));
  url.searchParams.set("customerIPAddress", String(getArg("ip", "127.0.0.1")));
  url.searchParams.set("customerUserAgent", String(getArg("ua", "TI inspect script")));
  url.searchParams.set("sc", String(getArg("sc", "tournamentinsights")));

  const body = {
    hotelID: propertyId,
    hotelIDTypeID: Number.isInteger(hotelIDTypeID) ? hotelIDTypeID : 0,
    checkIn,
    checkOut,
    roomCount: Number(getArg("rooms", "1")),
    adultCount: Number(getArg("adults", "2")),
    childCount: Number(getArg("children", "0")),
  };

  console.log("[request] url", url.toString());
  console.log("[request] body", JSON.stringify(body, null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: buildAuthorizationToken(config, epoch),
      "x-hp-api-siteid": config.siteId,
      "content-type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  console.log(`[response] status=${response.status}`);
  if (!response.ok) {
    console.log(JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  const root = payload?.data ?? payload?.result ?? payload ?? {};
  const availabilities = Array.isArray(root?.availabilities) ? root.availabilities : [];
  const firstAvailability = availabilities[0] ?? null;
  const roomRates = Array.isArray(firstAvailability?.roomRates)
    ? firstAvailability.roomRates
    : Array.isArray(firstAvailability?.rooms)
      ? firstAvailability.rooms
      : [];
  const firstRoom = roomRates[0] ?? null;

  console.log("[summary] root keys", safeKeys(root));
  console.log("[summary] first availability keys", safeKeys(firstAvailability));
  console.log("[summary] room count", roomRates.length);
  console.log("[summary] first room keys", safeKeys(firstRoom));

  const candidates = collectInterestingFields(firstRoom).slice(0, 80);
  console.log("[summary] candidate handoff fields");
  for (const [fieldPath, value] of candidates) {
    const rendered = typeof value === "string" ? value : JSON.stringify(value);
    console.log(`  ${fieldPath}: ${rendered}`);
  }

  console.log("[sample] first room payload");
  console.log(JSON.stringify(firstRoom, null, 2));
}

main().catch((error) => {
  console.error("[fatal]", error instanceof Error ? error.message : error);
  process.exit(1);
});
