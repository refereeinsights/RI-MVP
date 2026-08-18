import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { hotelSupportTermsSha256 } from "../../../packages/lib/hotel-support/security";

const repoRoot = resolve(process.cwd());
const migration = readFileSync(
  resolve(repoRoot, "supabase/migrations/20260817_ti_hotel_support_director_enrollment.sql"),
  "utf8"
);
const adminService = readFileSync(resolve(repoRoot, "apps/referee/lib/hotelSupportEnrollmentAdmin.ts"), "utf8");
const enrollmentForm = readFileSync(
  resolve(repoRoot, "apps/ti-web/app/hotel-support/enroll/[token]/EnrollmentForm.tsx"),
  "utf8"
);

test("migration stores only SHA-256 token hashes and enforces one active invitation", () => {
  assert.match(migration, /token_hash text not null unique/);
  assert.doesNotMatch(migration, /raw_token|opaque_token text/);
  assert.match(migration, /unique index[\s\S]*\(tournament_id\)[\s\S]*where state = 'active'/);
});

test("acceptance evidence rejects updates and deletes", () => {
  assert.match(migration, /before update or delete on public\.ti_hotel_support_acceptances/);
  assert.match(migration, /before update or delete on public\.ti_hotel_support_enrollment_audit/);
  assert.match(migration, /invitation_id uuid not null unique/);
});

test("submission locks its invitation and persists canonical terms hash", () => {
  assert.match(migration, /for update;/);
  assert.match(migration, /submit_ti_hotel_support_enrollment_v1/);
  assert.ok(migration.includes(hotelSupportTermsSha256()));
});

test("database guard covers every new active Tournament Support transition", () => {
  assert.match(migration, /before insert or update on public\.ti_tournament_hotel_programs/);
  assert.match(migration, /approved same-rate director enrollment/);
});

test("new tables and RPCs are service-role only", () => {
  assert.match(migration, /revoke all on table public\.ti_hotel_support_invitations from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.submit_ti_hotel_support_enrollment_v1[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.submit_ti_hotel_support_enrollment_v1[\s\S]*to service_role/);
});

test("every RI enrollment mutation authenticates an admin before its RPC", () => {
  for (const functionName of [
    "adminCreateHotelSupportInvitation",
    "adminRevokeHotelSupportInvitation",
    "adminReviewHotelSupportEnrollment",
  ]) {
    const start = adminService.indexOf(`export async function ${functionName}`);
    assert.notEqual(start, -1);
    const body = adminService.slice(start, start + 1_200);
    assert.match(body, /await requireAdmin\(\)/);
  }
});

test("public form cannot submit authoritative tournament, rate, terms, tax, or banking fields", () => {
  assert.doesNotMatch(enrollmentForm, /name="(?:tournament|rate|terms_version|terms_hash|ssn|ein|bank|routing|account)/i);
  assert.doesNotMatch(enrollmentForm, /W-9|tax identification|payment credential/i);
});

test("submission and review RPCs never mutate Hotel Program configuration", () => {
  const submissionBody = migration.slice(
    migration.indexOf("create or replace function public.submit_ti_hotel_support_enrollment_v1"),
    migration.indexOf("create or replace function public.review_ti_hotel_support_enrollment_v1")
  );
  const reviewBody = migration.slice(
    migration.indexOf("create or replace function public.review_ti_hotel_support_enrollment_v1"),
    migration.indexOf("alter table public.ti_hotel_support_invitations enable row level security")
  );
  assert.doesNotMatch(submissionBody, /insert into public\.ti_tournament_hotel_programs|update public\.ti_tournament_hotel_programs/);
  assert.doesNotMatch(reviewBody, /insert into public\.ti_tournament_hotel_programs|update public\.ti_tournament_hotel_programs/);
});
