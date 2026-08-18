import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("active auth-email callers use query-bearing callbacks without embedding credentials", () => {
  const corralioSignIn = read("apps/corralio/app/components/SignInForm.tsx");
  const corralioRedirect = read("apps/corralio/lib/authEmailRedirect.ts");
  assert.match(corralioSignIn, /buildCorralioAuthEmailRedirect\(window\.location\.origin\)/);
  assert.match(corralioRedirect, /searchParams\.set\("brand", "corralio"\)/);

  const riSignup = read("apps/referee/lib/auth.ts");
  const riAdmin = read("apps/referee/lib/admin.ts");
  const riRedirect = read("apps/referee/lib/authEmailRedirect.ts");
  assert.match(riSignup, /buildRiAuthEmailRedirect/);
  assert.match(riAdmin, /emailRedirectTo: buildRiAuthEmailRedirect\(siteOrigin\)/);
  assert.match(riRedirect, /searchParams\.set\("auth_callback", "1"\)/);

  for (const path of [
    "apps/ti-web/app/signup/page.tsx",
    "apps/ti-web/app/verify-email/ResendVerificationForm.tsx",
    "apps/ti-web/app/api/auth/send-login-link/route.ts",
    "apps/ti-web/app/api/tournament-claim/start/route.ts",
    "apps/referee/app/admin/ti/page.tsx",
  ]) {
    assert.match(read(path), /(?:\?next=|searchParams\.set\("next")/);
  }

  const smoke = read("apps/ti-web/smoke-auth-emails.ts");
  assert.match(smoke, /emailRedirectTo: magicLinkRedirectTo/);
  assert.match(smoke, /url\.searchParams\.set\("next", "\/account"\)/);

  for (const path of [
    "apps/corralio/lib/authEmailRedirect.ts",
    "apps/referee/lib/authEmailRedirect.ts",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /searchParams\.set\("(?:token_hash|code)"/);
  }
});

test("all confirm handlers accept email token hashes and do not authorize sentinel parameters", () => {
  for (const path of [
    "apps/corralio/app/auth/confirm/route.ts",
    "apps/ti-web/app/auth/confirm/route.ts",
    "apps/referee/app/auth/confirm/route.ts",
  ]) {
    const source = read(path);
    assert.match(source, /token_hash/);
    assert.match(source, /verifyOtp/);
    assert.match(source, /email/);
    assert.doesNotMatch(source, /searchParams\.get\("(?:brand|auth_callback)"\)/);
  }
});

test("auth documentation preserves ConfirmationURL fallback and guarded ampersand construction", () => {
  const docs = read("docs/auth-email-tokenhash.md");
  assert.match(docs, /brand=corralio/);
  assert.match(docs, /auth_callback=1/);

  for (const [path, variable] of [
    ["docs/templates/supabase-confirm-signup-shared.html", "confirmUrl"],
    ["docs/templates/supabase-magic-link-shared.html", "signInUrl"],
  ]) {
    const template = read(path);
    assert.match(template, new RegExp(`\\$${variable} := \\.ConfirmationURL`));
    assert.match(template, /if \$redirectTo/);
    assert.match(template, /%s&token_hash=%s&type=email/);
    assert.match(template, /eq \$redirectTo "http:\/\/localhost:3002\/auth\/confirm\?brand=corralio"/);
    assert.match(template, /eq \$redirectTo "https:\/\/corralio\.com\/auth\/confirm\?brand=corralio"/);
    assert.match(template, /if \$isCorralio/);
  }
});
