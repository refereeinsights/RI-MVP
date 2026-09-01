import { resolve } from "node:path";
import {
  readEnvFile,
  validateSpikeConfig,
} from "./corralio_sms_telnyx_spike_safety.mjs";

const API_ORIGIN = "https://api.telnyx.com/v2";
const MAX_RESPONSE_BYTES = 1024 * 1024;

function classifyHttp(status) {
  if (status >= 200 && status < 300) return "success";
  if (status === 401 || status === 403) return "authorization_error";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_error";
  return "request_error";
}

async function boundedGet(path, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${API_ORIGIN}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_RESPONSE_BYTES) return { ok: false, category: "response_too_large" };
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) return { ok: false, category: "response_too_large" };
    if (!response.ok) return { ok: false, category: classifyHttp(response.status) };
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      return { ok: false, category: "invalid_json" };
    }
  } catch (error) {
    return { ok: false, category: error?.name === "AbortError" ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timeout);
  }
}

function listData(response) {
  return Array.isArray(response?.data) ? response.data : [];
}

function boundedCount(count) {
  if (count === 0) return "zero";
  if (count === 1) return "one";
  return "multiple";
}

async function run() {
  const envPath = resolve("apps/corralio/.env.local");
  let config;
  try {
    config = validateSpikeConfig(await readEnvFile(envPath));
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ configuration: "invalid", missingOrInvalidName: error?.code ?? "unknown" })}\n`);
    process.exitCode = 1;
    return;
  }

  const report = {
    configuration: {
      status: "valid",
      publicKeyParseable: true,
      sendMode: "test_allowlist",
      allowlistCount: config.allowlist.size,
      limits: {
        daily: config.dailyLimit,
        perDestination: config.destinationDailyLimit,
        perMessage: config.maxSegmentsPerMessage,
      },
    },
    providerReads: {},
  };

  const profile = await boundedGet(`/messaging_profiles/${encodeURIComponent(config.profileId)}`, config.apiKey);
  if (!profile.ok) {
    report.providerReads.profile = { status: profile.category };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  const profileData = profile.data?.data ?? {};
  report.providerReads.apiAuthentication = "success";
  report.providerReads.profile = {
    exists: profileData.id === config.profileId,
    enabled: profileData.enabled === true,
    webhookApiVersion: typeof profileData.webhook_api_version === "string" ? profileData.webhook_api_version : "unavailable",
    webhookConfigured: typeof profileData.webhook_url === "string" && profileData.webhook_url.length > 0,
    spendLimitExposed: "daily_spend_limit" in profileData && "daily_spend_limit_enabled" in profileData,
    spendLimitEnabled: profileData.daily_spend_limit_enabled === true,
    spendLimitMatchesFounderReport: Number(profileData.daily_spend_limit) === 5,
    smartEncoding: typeof profileData.smart_encoding === "boolean" ? profileData.smart_encoding : "unavailable",
  };

  const numberQuery = new URLSearchParams({
    "filter[phone_number]": config.fromNumber,
    "page[size]": "1",
  });
  const numbers = await boundedGet(`/phone_numbers?${numberQuery.toString()}`, config.apiKey);
  if (!numbers.ok) {
    report.providerReads.number = { status: numbers.category };
  } else {
    const matching = listData(numbers.data).filter((item) => item?.phone_number === config.fromNumber);
    const number = matching[0];
    report.providerReads.number = {
      matchCount: boundedCount(matching.length),
      exists: matching.length === 1,
      active: number?.status === "active",
      countryUS: number?.country_iso_alpha2 === "US",
      profileAssociationMatches: number?.messaging_profile_id === config.profileId,
    };
    if (number?.id) {
      const messaging = await boundedGet(`/phone_numbers/${encodeURIComponent(number.id)}/messaging`, config.apiKey);
      if (messaging.ok) {
        const settings = messaging.data?.data ?? {};
        report.providerReads.number.messagingSettings = {
          available: true,
          profileAssociationMatches: settings.messaging_profile_id === config.profileId,
          productCategory: typeof settings.messaging_product === "string" ? settings.messaging_product : "unavailable",
          trafficTypeCategory: typeof settings.traffic_type === "string" ? settings.traffic_type : "unavailable",
          smsDomesticTwoWay: settings.features?.sms?.domestic_two_way === true,
        };
      } else {
        report.providerReads.number.messagingSettings = { available: false, status: messaging.category };
      }
    }
  }

  const autoresponses = await boundedGet(
    `/messaging_profiles/${encodeURIComponent(config.profileId)}/autoresp_configs?page[size]=100`,
    config.apiKey,
  );
  if (!autoresponses.ok) {
    report.providerReads.autoResponses = { status: autoresponses.category };
  } else {
    const configurations = listData(autoresponses.data);
    const byOperation = (operation) => configurations.filter(
      (item) => String(item?.op ?? "").toLowerCase() === operation,
    );
    const operationHasKeyword = (operation, keyword) => byOperation(operation).some(
      (item) => Array.isArray(item?.keywords) && item.keywords.some(
        (value) => String(value).toUpperCase() === keyword,
      ),
    );
    report.providerReads.autoResponses = {
      endpointAvailable: true,
      configurationCount: boundedCount(configurations.length),
      start: {
        operationPresent: byOperation("start").length > 0,
        canonicalKeywordPresent: operationHasKeyword("start", "START"),
        responseConfigured: byOperation("start").some((item) => typeof item?.resp_text === "string" && item.resp_text.length > 0),
      },
      stop: {
        operationPresent: byOperation("stop").length > 0,
        canonicalKeywordPresent: operationHasKeyword("stop", "STOP"),
        responseConfigured: byOperation("stop").some((item) => typeof item?.resp_text === "string" && item.resp_text.length > 0),
      },
      help: {
        operationPresent: byOperation("help").length > 0,
        canonicalKeywordPresent: operationHasKeyword("help", "HELP"),
        responseConfigured: byOperation("help").some((item) => typeof item?.resp_text === "string" && item.resp_text.length > 0),
      },
    };
  }

  const brands = await boundedGet("/10dlc/brand?page[size]=25", config.apiKey);
  report.providerReads.tenDlcBrands = brands.ok
    ? {
        endpointAvailable: true,
        count: boundedCount(listData(brands.data).length),
        statuses: [...new Set(listData(brands.data).map((item) => item?.status ?? item?.identityStatus).filter((value) => typeof value === "string"))].sort(),
      }
    : { endpointAvailable: false, status: brands.category };

  const campaigns = await boundedGet("/10dlc/campaignBuilder?page[size]=25", config.apiKey);
  report.providerReads.tenDlcCampaigns = campaigns.ok
    ? {
        endpointAvailable: true,
        count: boundedCount(listData(campaigns.data).length),
        statuses: [...new Set(listData(campaigns.data).map((item) => item?.status).filter((value) => typeof value === "string"))].sort(),
      }
    : { endpointAvailable: false, status: campaigns.category };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await run();
