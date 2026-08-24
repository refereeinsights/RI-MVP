import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { middleware } from "../middleware";
import {
  CORRALIO_ACQUISITION_COOKIE,
  CORRALIO_ACQUISITION_COOKIE_MAX_AGE,
  TI_WEEKEND_PLANNER_PROVENANCE,
} from "./acquisition";

async function runWithoutSupabase(url: string, init?: RequestInit) {
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    return await middleware(new NextRequest(url, init));
  } finally {
    if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedKey;
  }
}

test("sets the secure acquisition cookie for the exact HTTPS invite source", async () => {
  const response = await runWithoutSupabase(
    `https://corralio.invalid/?src=${TI_WEEKEND_PLANNER_PROVENANCE}`,
  );
  const cookie = response.cookies.get(CORRALIO_ACQUISITION_COOKIE);
  assert.equal(cookie?.value, TI_WEEKEND_PLANNER_PROVENANCE);
  assert.equal(cookie?.httpOnly, true);
  assert.equal(cookie?.sameSite, "lax");
  assert.equal(cookie?.secure, true);
  assert.equal(cookie?.path, "/");
  assert.equal(cookie?.maxAge, CORRALIO_ACQUISITION_COOKIE_MAX_AGE);
});

test("keys the secure attribute to actual transport", async () => {
  const response = await runWithoutSupabase(
    `http://localhost:3002/?src=${TI_WEEKEND_PLANNER_PROVENANCE}`,
  );
  assert.equal(response.cookies.get(CORRALIO_ACQUISITION_COOKIE)?.secure, false);
});

test("does not set or clear attribution for missing or unrecognized sources", async () => {
  for (const url of [
    "https://corralio.invalid/",
    "https://corralio.invalid/?src=direct",
    "https://corralio.invalid/?src=TI_WEEKEND_PLANNER_OPT_IN",
  ]) {
    const response = await runWithoutSupabase(url);
    assert.equal(response.cookies.get(CORRALIO_ACQUISITION_COOKIE), undefined);
    assert.equal(response.headers.get("set-cookie"), null);
  }

  const responseWithExistingCookie = await runWithoutSupabase(
    "https://corralio.invalid/?src=direct",
    {
      headers: {
        cookie: `${CORRALIO_ACQUISITION_COOKIE}=${TI_WEEKEND_PLANNER_PROVENANCE}`,
      },
    },
  );
  assert.equal(responseWithExistingCookie.headers.get("set-cookie"), null);
});
