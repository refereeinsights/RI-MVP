import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  HOTEL_SUPPORT_TERMS_V2_SHA256,
  hotelSupportTermsSha256,
} from "../../../packages/lib/hotel-support/security";

const repoRoot = resolve(process.cwd());
const migration = readFileSync(
  resolve(repoRoot, "supabase/migrations/20260817_ti_hotel_support_director_enrollment.sql"),
  "utf8"
);
const v2Migration = readFileSync(
  resolve(repoRoot, "supabase/migrations/20260818_ti_hotel_support_enrollment_ux_v2.sql"),
  "utf8"
);
const adminService = readFileSync(resolve(repoRoot, "apps/referee/lib/hotelSupportEnrollmentAdmin.ts"), "utf8");
const enrollmentForm = readFileSync(
  resolve(repoRoot, "apps/ti-web/app/hotel-support/enroll/[token]/EnrollmentForm.tsx"),
  "utf8"
);
const enrollmentPage = readFileSync(
  resolve(repoRoot, "apps/ti-web/app/hotel-support/enroll/[token]/page.tsx"),
  "utf8"
);
const enrollmentStyles = readFileSync(
  resolve(repoRoot, "apps/ti-web/app/hotel-support/enroll/[token]/page.module.css"),
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

test("v2 migration stores precise three-checkbox evidence without pretending legacy boxes were checked", () => {
  assert.match(v2Migration, /confirmation_version text not null default 'five_checkbox_v1'/);
  assert.match(v2Migration, /confirmation_version = 'three_checkbox_v2'/);
  assert.match(v2Migration, /confirm_no_guarantee is null/);
  assert.match(v2Migration, /confirm_eligible_attribution is null/);
  assert.match(v2Migration, /'three_checkbox_v2',[\s\S]*p_confirm_authority,[\s\S]*p_confirm_housing_eligibility,[\s\S]*null,[\s\S]*null,[\s\S]*p_confirm_terms/);
  const preservedV1Body = v2Migration.slice(
    v2Migration.indexOf("create or replace function public.submit_ti_hotel_support_enrollment_v1"),
    v2Migration.indexOf("create or replace function public.submit_ti_hotel_support_enrollment_v2")
  );
  assert.match(preservedV1Body, /'five_checkbox_v1'/);
});

test("v2 migration embeds both offline canonical hashes and excludes individual recipients", () => {
  assert.ok(v2Migration.includes(HOTEL_SUPPORT_TERMS_V2_SHA256[500]));
  assert.ok(v2Migration.includes(HOTEL_SUPPORT_TERMS_V2_SHA256[1000]));
  assert.match(v2Migration, /where expected_recipient_type = 'individual'/);
  const recipientConstraint = v2Migration.slice(
    v2Migration.indexOf("add constraint ti_hotel_support_acceptances_recipient_type_check"),
    v2Migration.indexOf("alter table public.ti_hotel_support_acceptances\n  drop constraint ti_hotel_support_acceptances_confirmations_check")
  );
  assert.doesNotMatch(recipientConstraint, /'individual'/);
});

test("v2 submission is locked, idempotent, server-authoritative, and service-role only", () => {
  assert.match(v2Migration, /submit_ti_hotel_support_enrollment_v2/);
  assert.match(v2Migration, /for update;/);
  assert.match(v2Migration, /return query select 'already_submitted'::text, v_enrollment_id, v_existing_name/);
  assert.doesNotMatch(v2Migration, /p_(?:tournament_id|offered_rate|terms_version|terms_sha|confirmation_version)/);
  assert.match(v2Migration, /revoke all on function public\.submit_ti_hotel_support_enrollment_v2[\s\S]*from public, anon, authenticated/);
  assert.match(v2Migration, /grant execute on function public\.submit_ti_hotel_support_enrollment_v2[\s\S]*to service_role/);
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

test("director form uses the refined recipient, CTA, and exactly three confirmation controls", () => {
  assert.match(enrollmentForm, /Who should receive the tournament support proceeds\?/);
  assert.match(enrollmentForm, /Enroll my tournament/);
  assert.match(enrollmentForm, /Enrollment does not activate the program/);
  assert.doesNotMatch(enrollmentForm, /value="individual"|fee routing/);
  assert.equal(enrollmentForm.match(/type="checkbox"/g)?.length, 3);
});

test("director page uses the simplified trusted summary and a protected new-tab hotel link", () => {
  assert.match(enrollmentPage, /Tournament Hotel Support · Enrollment/);
  assert.match(enrollmentPage, /Help your teams find hotels and support your tournament/);
  assert.match(enrollmentPage, /There’s nothing new for you to manage/);
  assert.match(enrollmentPage, /Tournament support<\/dt><dd>\{formatTournamentSupportRate\(invitation\.offeredRateCents\)\}/);
  assert.match(enrollmentPage, /Invitation valid through/);
  assert.match(enrollmentPage, /timeZone: "UTC"/);
  assert.doesNotMatch(enrollmentPage, /Support benefits<\/dt>|Status<\/dt>|hour: "numeric"|timeZoneName/);
  assert.match(enrollmentPage, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(enrollmentPage, /fee routing/);
});

test("mobile styles stack fields and keep the CTA inside the viewport", () => {
  assert.match(enrollmentStyles, /@media \(max-width: 620px\)/);
  assert.match(enrollmentStyles, /\.fieldGrid \{\s*grid-template-columns: 1fr;/);
  assert.match(enrollmentStyles, /\.submitButton \{\s*justify-self: stretch;\s*width: 100%;/);
  assert.match(enrollmentStyles, /\.card \{[\s\S]*?width: min\(100%, 780px\);/);
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
  assert.doesNotMatch(v2Migration, /insert into public\.ti_tournament_hotel_programs|update public\.ti_tournament_hotel_programs/);
});
