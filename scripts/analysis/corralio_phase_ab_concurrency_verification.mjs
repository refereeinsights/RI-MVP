#!/usr/bin/env node
// Real-PostgreSQL verifier for the two Phase A+B atomic uniqueness claims.
// Parallel production-path RPC requests prove the races. The authenticated,
// linked Supabase Management API is used only for exact fixture setup/cleanup.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const confirmed = process.argv.includes("--confirm-database");
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!confirmed || !supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Pass --confirm-database with SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY only after human migration application",
  );
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const linkedProjectRef = readFileSync("supabase/.temp/project-ref", "utf8").trim();
if (!projectRef || projectRef !== linkedProjectRef) {
  throw new Error("Supabase API project does not match the linked database project");
}

const eventId = "phase_ab_concurrency_event";
const hmac = `v1:${"c".repeat(64)}`;
const userId = "abcc0000-0000-4000-8000-000000000001";
const householdId = "abcc0000-0000-4000-8000-000000000011";
const cliArgs = ["--yes", "supabase@2.116.0", "db", "query"];

function databaseQuery(sql) {
  const result = spawnSync(
    "npx",
    [...cliArgs, sql, "--linked", "--agent=no", "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.status !== 0) {
    throw new Error("Phase A+B linked database verification command failed");
  }
}

async function rpc(functionName, body) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Phase A+B ${functionName} RPC failed with HTTP ${response.status}`);
  }
  return response.json();
}

function assertEmptyNamespaceSql() {
  return `do $verify$
  begin
    if (select count(*) from public.corralio_telnyx_inbound_claims
        where event_id = '${eventId}') <> 0
      or (select count(*) from public.corralio_pending_schedule_intakes
        where url_fingerprint = '${hmac}') <> 0
      or (select count(*) from auth.users where id = '${userId}') <> 0
      or (select count(*) from public.corralio_households
        where id = '${householdId}') <> 0 then
      raise exception 'Phase A+B concurrency fixture namespace is not empty';
    end if;
  end
  $verify$;`;
}

function setupSql() {
  return `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
    ('00000000-0000-0000-0000-000000000000','${userId}','authenticated','authenticated',
      'phase-ab-concurrency@example.invalid','',clock_timestamp(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,
      clock_timestamp(),clock_timestamp());
    insert into public.corralio_households(id,display_name)
      values ('${householdId}','Phase AB concurrency');
    insert into public.corralio_household_members(household_id,user_id)
      values ('${householdId}','${userId}');`;
}

function cleanupSql() {
  return `delete from public.corralio_telnyx_inbound_claims
      where event_id = '${eventId}';
    delete from public.corralio_households where id = '${householdId}';
    delete from auth.users where id = '${userId}';`;
}

databaseQuery(assertEmptyNamespaceSql());

try {
  const claimBody = { p_event_id: eventId };
  const claims = await Promise.all([
    rpc("corralio_claim_telnyx_inbound_v1", claimBody),
    rpc("corralio_claim_telnyx_inbound_v1", claimBody),
  ]);
  const claimDecisions = claims.map((rows) => rows?.[0]?.decision);
  if (claimDecisions.filter((value) => value === "claimed").length !== 1
    || claimDecisions.filter((value) => value === "duplicate").length !== 1) {
    throw new Error("Inbound event race did not produce one claim and one duplicate");
  }

  databaseQuery(setupSql());
  const pendingBody = {
    p_user_id: userId,
    p_household_id: householdId,
    p_url_envelope: "synthetic-encrypted-envelope",
    p_url_fingerprint: hmac,
    p_candidate_team_ids: [],
    p_candidate_child_ids: [],
  };
  const pending = await Promise.all([
    rpc("corralio_create_pending_schedule_intake_v1", pendingBody),
    rpc("corralio_create_pending_schedule_intake_v1", pendingBody),
  ]);
  const pendingCreated = pending.map((rows) => rows?.[0]?.created);
  if (pendingCreated.filter((value) => value === true).length !== 1
    || pendingCreated.filter((value) => value === false).length !== 1) {
    throw new Error("Pending intake race did not produce one creation and one reuse");
  }

  databaseQuery(`do $verify$
  begin
    if (select count(*) from public.corralio_pending_schedule_intakes
        where household_id = '${householdId}' and url_fingerprint = '${hmac}') <> 1 then
      raise exception 'Pending intake race created more than one open record';
    end if;
  end
  $verify$;`);
} finally {
  databaseQuery(cleanupSql());
}

databaseQuery(assertEmptyNamespaceSql());
process.stdout.write("CORRALIO PHASE A+B CONCURRENCY VERIFICATION PASSED; CLEANUP ZERO\n");
