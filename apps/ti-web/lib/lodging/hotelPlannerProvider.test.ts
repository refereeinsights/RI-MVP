import { createHmac } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHotelPlannerAuthorizationToken,
  buildHotelPlannerQuery,
  createHotelPlannerProvider,
} from "./hotelPlannerProvider";

function testConfig(overrides: Partial<{
  apiKey: string;
  secretKey: string;
  accountId: string;
  siteId: string;
  baseUrl: string;
  whiteLabelBaseUrl: string;
}> = {}) {
  return {
    apiKey: "AK",
    secretKey: "SK",
    accountId: "A1",
    siteId: "S1",
    baseUrl: "https://api.hotelplanner.com/hpapi/v2.3/",
    whiteLabelBaseUrl: "https://wl.example.com",
    ...overrides,
  };
}

test("buildHotelPlannerQuery includes required auth params and optional fields", () => {
  const query = buildHotelPlannerQuery("multiPropertySearch", {
    customerIPAddress: "203.0.113.7",
    customerUserAgent: "Mozilla/5.0",
    locale: "en_US",
    currency: "USD",
    sc: "tournamentinsights",
    epoch: 1710000000,
  });
  const params = new URLSearchParams(query);
  assert.equal(params.get("method"), "multiPropertySearch");
  assert.equal(params.get("epoch"), "1710000000");
  assert.equal(params.get("customerIPAddress"), "203.0.113.7");
  assert.equal(params.get("customerUserAgent"), "Mozilla/5.0");
  assert.equal(params.get("locale"), "en_US");
  assert.equal(params.get("currency"), "USD");
  assert.equal(params.get("sc"), "tournamentinsights");
});

test("buildHotelPlannerAuthorization token style is base64url no '=' padding", () => {
  const epoch = 1710000000;
  const config = testConfig();
  const actual = buildHotelPlannerAuthorizationToken(config, epoch);
  const encodedApiKey = Buffer.from(config.apiKey).toString("base64url");
  const signatureInput = `${encodedApiKey}|${config.accountId}|${epoch}`;
  const signature = createHmac("sha256", config.secretKey).update(signatureInput).digest("base64url");
  const expected = `${encodedApiKey}.${signature}`;
  assert.equal(actual, expected);
  assert.equal(expected.includes("="), false, "expected token should not include '=' padding");
  assert.equal(expected.split(".").length, 2);
  assert.equal(typeof expected, "string");
});

test("createHotelPlannerProvider sends method, auth headers, and request context", async () => {
  const config = testConfig();
  const provider = createHotelPlannerProvider(config);

  const originalFetch = global.fetch;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  (global as { fetch: typeof global.fetch }).fetch = async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({
      url: typeof url === "string" ? url : url.toString(),
      init,
    });
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          hotels: [],
          availabilities: [],
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  };

  try {
    const result = await provider.searchHotels({
      checkIn: "08/01/2026",
      checkOut: "08/03/2026",
      roomCount: 1,
      adultCount: 2,
      destination: "Denver, CO",
      customerIPAddress: "198.51.100.4",
      customerUserAgent: "agent/1.2",
      source: "tournamentinsights",
      locale: "en_US",
      currency: "USD",
      sc: "tournamentinsights",
    });

    assert.equal(result.provider, "hotelplanner");
    assert.equal(calls.length, 1);
    const call = calls[0];
    const requestUrl = new URL(call.url);
    assert.equal(requestUrl.pathname, "/hpapi/v2.3/");
    assert.equal(requestUrl.searchParams.get("method"), "multiPropertySearch");
    assert.equal(requestUrl.searchParams.get("customerIPAddress"), "198.51.100.4");
    assert.equal(requestUrl.searchParams.get("customerUserAgent"), "agent/1.2");
    assert.equal(call.init.method, "POST");
    const headers = new Headers(call.init.headers as HeadersInit);
    assert.ok(headers.get("authorization"), "expected authorization header");
    assert.equal(headers.get("x-hp-api-siteid"), "S1");
    assert.equal(headers.get("content-type"), "application/json; charset=UTF-8");
  } finally {
    global.fetch = originalFetch;
  }
});

test("searchHotels normalizes object-mapped hotel payloads", async () => {
  const config = testConfig();
  const provider = createHotelPlannerProvider(config);

  const originalFetch = global.fetch;
  (global as { fetch: typeof global.fetch }).fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        data: {
          hotels: {
            "0_67747": {
              hotelID: "67747",
              hotelname: "Blue Star Hotel",
              city: "Denver",
              state: "CO",
              fromRate: 199,
              currency: "USD",
            },
            "0_67748": {
              hotelID: "67748",
              hotelname: "Hotel Two",
              city: "Denver",
              state: "CO",
              fromRate: 200,
              currency: "USD",
            },
          },
          availabilities: [
            {
              hotelID: "67747",
              fromRate: 199,
            },
            {
              hotelID: "67748",
              fromRate: 200,
            },
          ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  try {
    const result = await provider.searchHotels({
      checkIn: "08/01/2026",
      checkOut: "08/03/2026",
      roomCount: 1,
      adultCount: 2,
      destination: "Denver, CO",
      customerIPAddress: "198.51.100.4",
      customerUserAgent: "agent/1.2",
    });

    assert.equal(result.hotels.length, 2);
    assert.equal(result.hotels[0].id, "67747");
    assert.equal(result.hotels[0].fromPrice, 199);
    assert.equal(result.fallback?.showBookingFallback, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("searchHotels derives fromPrice from availability roomRates", async () => {
  const config = testConfig();
  const provider = createHotelPlannerProvider(config);

  const originalFetch = global.fetch;
  (global as { fetch: typeof global.fetch }).fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        data: {
          hotels: {
            "0_67747": {
              hotelID: "67747",
              hotelname: "Blue Star Hotel",
              city: "Denver",
              state: "CO",
              currency: "USD",
            },
          },
          availabilities: [
            {
              hotelID: "67747",
              roomRates: [
                {
                  roomTypeCode: "DBL",
                  averageAfterTax: 159,
                  totalAfterTax: 477,
                  rates: [{ amountAfterTax: 159, totalAfterTax: 159 }],
                },
                {
                  roomTypeCode: "DBL2",
                  averageAfterTax: 189,
                },
              ],
            },
          ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  try {
    const result = await provider.searchHotels({
      checkIn: "08/01/2026",
      checkOut: "08/03/2026",
      roomCount: 1,
      adultCount: 2,
      destination: "Denver, CO",
      customerIPAddress: "198.51.100.4",
      customerUserAgent: "agent/1.2",
    });

    assert.equal(result.hotels.length, 1);
    assert.equal(result.hotels[0].id, "67747");
    assert.equal(result.hotels[0].fromPrice, 159);
    assert.equal(result.fallback?.showBookingFallback, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("searchHotels accepts HotelPlanner payload without success/code when hotels are present", async () => {
  const config = testConfig();
  const provider = createHotelPlannerProvider(config);

  const originalFetch = global.fetch;
  (global as { fetch: typeof global.fetch }).fetch = async () =>
    new Response(
      JSON.stringify({
        unpubLevel: "25",
        token: "9D8C6DD0-705A-44E1-BB4A-402293733A5A",
        paymentType: "DirectPay",
        sourceCode: "tournamentinsights",
        hotels: {
          "0_6248821": {
            hotelID: "6248821",
            hotelName: "Tru by Hilton Spokane Valley WA",
            city: "Spokane Valley",
            state: "WA",
            review: "4.6",
            reviewCount: 533,
            address1: "13509 East Mansfield Ave.",
            position: {
              longitude: -117.22277,
              latitude: 47.67737,
              distanceFromSearch: "2.45",
            },
          },
          "0_56796": {
            hotelID: 56796,
            hotelName: "Comfort Inn & Suites Spokane Valley Central",
            city: "Spokane Valley",
            state: "WA",
            review: "4.5",
            reviewCount: 869,
            address1: "12415 East Mission Ave",
            position: {
              longitude: -117.23732,
              latitude: 47.672646,
              distanceFromSearch: "2.75",
            },
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  try {
    const result = await provider.searchHotels({
      checkIn: "07/01/2026",
      checkOut: "07/03/2026",
      roomCount: 1,
      adultCount: 2,
      destination: "Spokane Valley, WA",
      customerIPAddress: "198.51.100.4",
      customerUserAgent: "agent/1.2",
    });

    assert.equal(result.hotels.length, 2);
    assert.equal(result.hotels[0].id, "6248821");
    assert.equal(result.hotels[0].name, "Tru by Hilton Spokane Valley WA");
  } finally {
    global.fetch = originalFetch;
  }
});

test("searchHotels accepts provider payload with code 200 and message", async () => {
  const config = testConfig();
  const provider = createHotelPlannerProvider(config);

  const originalFetch = global.fetch;
  (global as { fetch: typeof global.fetch }).fetch = async () =>
    new Response(
      JSON.stringify({
        code: "200",
        message: "Hotel search completed",
        hotels: {
          "0_11111": {
            hotelID: 11111,
            hotelName: "Test Hotel with Message",
            city: "Spokane Valley",
            state: "WA",
            fromRate: 159,
            currency: "USD",
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  try {
    const result = await provider.searchHotels({
      checkIn: "07/01/2026",
      checkOut: "07/03/2026",
      roomCount: 1,
      adultCount: 2,
      destination: "Spokane Valley, WA",
      customerIPAddress: "198.51.100.4",
      customerUserAgent: "agent/1.2",
    });

    assert.equal(result.hotels.length, 1);
    assert.equal(result.hotels[0].id, "11111");
    assert.equal(result.hotels[0].name, "Test Hotel with Message");
  } finally {
    global.fetch = originalFetch;
  }
});

test("getHotelAvailability normalizes roomRates payloads", async () => {
  const config = testConfig();
  const provider = createHotelPlannerProvider(config);

  const originalFetch = global.fetch;
    (global as { fetch: typeof global.fetch }).fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            hotelID: "67747",
            currencyCode: "USD",
            roomTypes: {
              "2144165": {
                name: "Premium Room 2 Queen Beds Courtyard Area",
                description: "Large room near courtyard with two queen beds",
              },
            },
            ratePlans: {
              RATE123: { name: "Best Flexible Rate", description: "Flexible cancellation" },
            },
            mealPlans: {
              MP03: { name: "Bed and Breakfast", description: "Breakfast included" },
            },
            availabilities: [
              {
                roomRates: [
                  {
                    roomTypeCode: 2144165,
                    totalAfterTax: 214.41,
                    averageAfterTax: 71.47,
                    bundle: "bundle-modern-room",
                    ratePlanCode: "RATE123",
                    mealPlanCode: "MP03",
                    payNow: true,
                    cancelPolicy: {
                      freeCancellation: true,
                      text: "Cancel before 09/16/2026 free",
                    },
                    rates: [
                      { amountAfterTax: 71.47, amountBeforeTax: 61.46, totalAfterTax: 71.47 },
                    ],
                  },
                  {
                    roomTypeCode: "DLX",
                    roomType: "LIgSQJrA8YVtLR7QfGpM-YKrc4xHATBbM1_tpVaNGN4",
                    rate: 275,
                    currency: "USD",
                    taxesAndFees: 12,
                    totalWithTaxes: 287,
                    cancelPolicy: "No refund",
                  },
                ],
              },
            ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  try {
    const result = await provider.getHotelAvailability({
      propertyId: "67747",
      checkIn: "08/01/2026",
      checkOut: "08/03/2026",
      roomCount: 1,
      adultCount: 2,
      customerIPAddress: "198.51.100.4",
      customerUserAgent: "agent/1.2",
    });

    assert.equal(result.roomOptions.length, 2);
    const legacy = result.roomOptions.find((option) => option.roomTypeCode === "DLX");
    assert.ok(legacy);
    assert.equal(legacy?.roomName, "Standard room");
    assert.equal(legacy?.rate, 275);

    const modern = result.roomOptions.find((option) => option.roomTypeCode === "2144165");
    assert.ok(modern);
    assert.equal(modern?.roomName, "Premium Room 2 Queen Beds Courtyard Area");
    assert.equal(modern?.rate, 214.41);
    assert.equal(modern?.roomDescription, "Large room near courtyard with two queen beds");
    assert.equal(modern?.ratePlanName, "Best Flexible Rate");
    assert.equal(modern?.mealPlanName, "Bed and Breakfast");
    assert.equal(modern?.nightlyRate, 71.47);
    assert.equal(modern?.isRefundable, true);
    assert.equal(modern?.bundle, "bundle-modern-room");
    assert.equal(modern?.ratePlanCode, "RATE123");
    assert.equal(modern?.payNow, true);
    assert.equal(modern?.totalWithTaxes, 71.47);
    assert.equal(modern?.cancelPolicy, "Cancel before 09/16/2026 free");
  } finally {
    global.fetch = originalFetch;
  }
});

test("getHotelAvailability uses friendly fallback when room name is unavailable", async () => {
  const config = testConfig();
  const provider = createHotelPlannerProvider(config);

  const originalFetch = global.fetch;
  (global as { fetch: typeof global.fetch }).fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        data: {
          hotelID: "888",
          roomTypes: {},
          availabilities: [
            {
              roomRates: [
                {
                  roomTypeCode: 12345,
                  totalAfterTax: 321.0,
                  totalBeforeTax: 300.0,
                  cancelPolicy: "Non refundable",
                  rates: [
                    {
                      amountAfterTax: 321.0,
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  try {
    const result = await provider.getHotelAvailability({
      propertyId: "888",
      checkIn: "07/02/2026",
      checkOut: "07/06/2026",
      roomCount: 1,
      adultCount: 2,
      customerIPAddress: "198.51.100.4",
      customerUserAgent: "agent/1.2",
    });

    assert.equal(result.roomOptions.length, 1);
    assert.equal(result.roomOptions[0].roomTypeCode, "12345");
    assert.equal(result.roomOptions[0].roomName, "Standard room");
    assert.equal(result.roomOptions[0].rate, 321);
  } finally {
    global.fetch = originalFetch;
  }
});
