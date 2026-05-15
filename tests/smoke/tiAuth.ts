import { expect, type APIResponse, type Page } from "playwright/test";

type Credentials = {
  email: string;
  password: string;
};

function getTiBaseUrl() {
  return new URL(process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3001");
}

function parseSetCookie(cookieHeader: string) {
  const [cookiePart, ...attrs] = cookieHeader.split(";").map((s) => s.trim()).filter(Boolean);
  const eqIdx = cookiePart.indexOf("=");
  const name = eqIdx >= 0 ? cookiePart.slice(0, eqIdx) : "";
  const value = eqIdx >= 0 ? cookiePart.slice(eqIdx + 1) : "";
  const attrSet = new Set(attrs.map((a) => a.toLowerCase()));
  const sameSite = attrs
    .map((a) => a.split("="))
    .find((p) => p[0]?.trim().toLowerCase() === "samesite")?.[1]
    ?.trim()
    ?.toLowerCase();
  const secure = attrSet.has("secure");
  const httpOnly = attrSet.has("httponly");
  const expiresRaw = attrs
    .map((a) => a.split("="))
    .find((p) => p[0]?.trim().toLowerCase() === "expires")?.[1]
    ?.trim();
  const expires = expiresRaw ? Date.parse(expiresRaw) : NaN;

  const sameSiteForPlaywright =
    sameSite === "lax" ? "Lax" : sameSite === "strict" ? "Strict" : sameSite === "none" ? "None" : undefined;

  return {
    name,
    value,
    secure,
    httpOnly,
    // Playwright expects SameSite as a capitalized enum string.
    sameSite: sameSiteForPlaywright,
    expires: Number.isFinite(expires) ? Math.floor(expires / 1000) : undefined,
  };
}

async function assertOkJson(resp: APIResponse) {
  const json = (await resp.json().catch(() => null)) as any;
  if (!resp.ok() || !json || json.ok !== true) {
    throw new Error(`Smoke auth failed: ${json?.error || `HTTP ${resp.status()}`}`);
  }
}

export async function logout(page: Page) {
  const base = getTiBaseUrl();
  await page.context().clearCookies();
  await page.goto(new URL("/logout?returnTo=/", base).toString(), { waitUntil: "domcontentloaded" });
}

export async function loginViaApi(page: Page, credentials: Credentials, returnTo: string) {
  const base = getTiBaseUrl();
  const resp = await page.request.post(new URL("/api/auth/login", base).toString(), {
    data: { identifier: credentials.email, password: credentials.password },
  });
  await assertOkJson(resp);

  const setCookies = resp
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value);

  const authCookieHeader = setCookies.find((c) => /^sb-[^=]+-auth-token=/.test(c));
  if (!authCookieHeader) {
    throw new Error("Smoke auth failed: missing Supabase auth cookie from /api/auth/login.");
  }

  const parsed = parseSetCookie(authCookieHeader);
  if (!parsed.name || !parsed.value) {
    throw new Error("Smoke auth failed: could not parse auth cookie.");
  }

  await page.context().addCookies([
    {
      name: parsed.name,
      value: parsed.value,
      domain: base.hostname,
      path: "/",
      httpOnly: parsed.httpOnly,
      secure: parsed.secure,
      sameSite: parsed.sameSite as any,
      expires: parsed.expires,
    },
  ]);

  // Navigate to the desired returnTo so the middleware can hydrate session state.
  await page.goto(new URL(returnTo, base).toString(), { waitUntil: "domcontentloaded" });
  // Sanity: the login page should not still be visible.
  await expect(page.getByRole("heading", { level: 1, name: "Log in" })).not.toBeVisible({ timeout: 10_000 });
}
