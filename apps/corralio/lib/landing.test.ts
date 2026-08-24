import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const landing = readFileSync(new URL("../app/components/SignedOutLanding.tsx", import.meta.url), "utf8");
const auth = readFileSync(new URL("../app/components/SignInForm.tsx", import.meta.url), "utf8");
const familyPage = readFileSync(new URL("../app/family/page.tsx", import.meta.url), "utf8");
const connectForm = readFileSync(new URL("../app/components/ConnectScheduleForm.tsx", import.meta.url), "utf8");
const connectedSchedules = readFileSync(new URL("../app/components/ConnectedScheduleList.tsx", import.meta.url), "utf8");

test("signed-out landing leads with the family problem, outcome, and account hierarchy", () => {
  assert.match(landing, /The planner built for sports families\./);
  assert.match(landing, /Every kid\. Every team\. One plan\./);
  assert.match(landing, /Team apps organize the team\. Corralio plans across the family\./);
  assert.match(landing, /href="#get-started-email">Get Started/);
  assert.match(landing, /href="#returning-sign-in">Sign in/);
  assert.ok(landing.indexOf("Get Started") < landing.indexOf("Sign in"));
  assert.doesNotMatch(landing, /Private pilot|Potential conflict/i);
});

test("the example weekend is static and separated from private product data", () => {
  assert.match(landing, /Example weekend/);
  assert.match(landing, /Saturday/);
  assert.match(landing, /Sunday/);
  assert.match(landing, /We’ve got the weekend figured out\./);
  assert.doesNotMatch(landing, /productData|supabase|sourceUrl|\.ics|fetch\(|use server|use client/i);
});

test("Get Started reuses the established Magic Link account path", () => {
  assert.match(auth, /Get Started with email/);
  assert.match(auth, /shouldCreateUser: true/);
  assert.match(auth, /event\.key !== "Enter"/);
  assert.match(auth, /void sendMagicLink\(\)/);
  assert.match(auth, /Sign in with your password/);
  assert.match(auth, /signInWithPassword/);
  assert.match(auth, /Forgot password\?/);
});

test("schedule setup leads with parent language and preserves precise lifecycle terms", () => {
  assert.match(familyPage, /Connect a schedule/);
  assert.match(connectForm, />Calendar link<\/label>/);
  assert.match(connectForm, /iCal or ICS subscription link/);
  assert.match(connectForm, /Connect schedule/);
  assert.match(connectedSchedules, /Change assignment/);
  assert.match(connectedSchedules, /Replace calendar link/);
  assert.match(connectedSchedules, /Connected/);
  assert.match(connectedSchedules, /Refresh delayed/);
  assert.match(connectedSchedules, /Schedule needs attention/);
});
