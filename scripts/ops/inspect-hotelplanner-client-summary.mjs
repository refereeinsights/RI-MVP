#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);

function getArg(name, fallback = null) {
  const prefix = `--${name}`;
  const index = argv.findIndex(
    (value) => value === prefix || value.startsWith(`${prefix}=`),
  );
  if (index === -1) return fallback;
  const raw = argv[index];
  if (raw.includes("=")) return raw.split("=", 2)[1] ?? fallback;
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) return fallback;
  return next;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const output = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    output[match[1]] = match[2];
  }
  return output;
}

function requireValue(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`Missing ${label}`);
  return normalized;
}

function buildAuthorizationToken({ apiKey, secretKey, accountId }, epoch) {
  const encodedApiKey = Buffer.from(apiKey).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(`${encodedApiKey}|${accountId}|${epoch}`)
    .digest("base64url");
  return `${encodedApiKey}.${signature}`;
}

function summarizeShape(payload) {
  const envelope = payload?.data ?? payload?.result ?? payload;
  const root = envelope?.summary ?? envelope;
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    return { rootType: Array.isArray(root) ? "array" : typeof root, collections: {} };
  }

  const collections = {};
  for (const [key, value] of Object.entries(root)) {
    if (!Array.isArray(value)) continue;
    collections[key] = {
      count: value.length,
      recordKeys:
        value[0] && typeof value[0] === "object"
          ? Object.keys(value[0]).sort()
          : [],
    };
  }
  return {
    rootType: "object",
    rootKeys: Object.keys(root).sort(),
    collections,
    authenticationEnvelopePresent: Boolean(
      envelope &&
        typeof envelope === "object" &&
        !Array.isArray(envelope) &&
        "token" in envelope,
    ),
  };
}

function redactResponseSecrets(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (!("token" in payload)) return payload;
  return { ...payload, token: "[REDACTED]" };
}

async function main() {
  const envPath = path.resolve(getArg("env", "apps/ti-web/.env.local"));
  const env = { ...process.env, ...parseEnvFile(envPath) };
  const emailAddress = requireValue(getArg("email"), "--email");
  const outputPath = getArg("output");

  const config = {
    apiKey: requireValue(env.HOTELPLANNER_API_KEY, "HOTELPLANNER_API_KEY"),
    secretKey: requireValue(
      env.HOTELPLANNER_SECRET_KEY,
      "HOTELPLANNER_SECRET_KEY",
    ),
    accountId: requireValue(
      env.HOTELPLANNER_ACCOUNT_ID,
      "HOTELPLANNER_ACCOUNT_ID",
    ),
    siteId: requireValue(env.HOTELPLANNER_SITE_ID, "HOTELPLANNER_SITE_ID"),
    baseUrl: String(
      env.HOTELPLANNER_BASE_URL || "https://api.hotelplanner.com/hpapi/v2.3/",
    ).trim(),
  };

  const epoch = Math.floor(Date.now() / 1000);
  const url = new URL(config.baseUrl);
  url.searchParams.set("method", "getClientSummary");
  url.searchParams.set("epoch", String(epoch));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: buildAuthorizationToken(config, epoch),
      "x-hp-api-siteid": config.siteId,
      "content-type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ emailAddress, products: "all" }),
  });
  const responseText = await response.text();
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = responseText;
  }

  if (outputPath) {
    fs.writeFileSync(
      path.resolve(outputPath),
      JSON.stringify(redactResponseSecrets(payload), null, 2),
      {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      },
    );
  }

  console.log(`[response] status=${response.status}`);
  console.log(JSON.stringify(summarizeShape(payload), null, 2));
  if (!response.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[fatal]", error instanceof Error ? error.message : "Unknown error");
  process.exit(1);
});
