#!/usr/bin/env node
// Real-PostgreSQL, multi-session Gate 3 race verifier. This verifier accepts
// only the dedicated isolated-database variable, never loads application env,
// and uses fixed HMAC-only fixtures plus one database-authoritative UTC date.
import { spawn, spawnSync } from "node:child_process";

if (process.argv.length !== 3 || process.argv[2] !== "--confirm-isolated") {
  throw new Error("Pass only --confirm-isolated for the authorized isolated database");
}
if (!process.env.CORRALIO_ISOLATED_DATABASE_URL) {
  throw new Error("Missing CORRALIO_ISOLATED_DATABASE_URL");
}
if (process.env.CORRALIO_DATABASE_URL) {
  throw new Error("CORRALIO_DATABASE_URL is prohibited; use the dedicated isolated-database variable");
}

const fixtureHmacs = ["a", "b", "c", "d", "e"].map((letter) => letter.repeat(64));
const [sameHmac, globalOneHmac, globalTwoHmac, destinationCapHmac, permitRaceHmac] = fixtureHmacs;
const fixtureIds = [
  "gate3_race_same",
  "gate3_race_global_one",
  "gate3_race_global_two",
  "gate3_race_destination_cap",
  "gate3_race_permit_one",
  "gate3_race_permit_two",
];
const env = {
  ...process.env,
  PGCONNECT_TIMEOUT: "10",
};
const databaseUrl = process.env.CORRALIO_ISOLATED_DATABASE_URL;

function sqlLiteral(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function run(sql) {
  const result = spawnSync("psql", ["--dbname", databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    env,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error("PostgreSQL verification command failed");
  return result.stdout.trim();
}
function finalResultRow(output) {
  const resultRows = output.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  return resultRows.at(-1) ?? "";
}
function concurrent(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", ["--dbname", databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], { env });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.resume();
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error("Concurrent PostgreSQL session failed"));
        return;
      }
      resolve(finalResultRow(output));
    });
  });
}
function hookSql(id, hmac) {
  return `begin; select set_config('request.jwt.claim.role','service_role',true); set local role service_role; select decision from public.corralio_authorize_sms_hook_attempt_v1(${sqlLiteral(id)},${sqlLiteral(hmac)},1::smallint); commit;`;
}
function permitSql(hmac) {
  return `insert into public.corralio_sms_phone_send_permits(destination_hmac,issued_at,expires_at,retain_until) values (${sqlLiteral(hmac)},clock_timestamp(),clock_timestamp() + interval '3 minutes',clock_timestamp() + interval '7 days');`;
}
function assert(condition, message) {
  if (!condition) throw new Error(`Gate 3 concurrency verification failed: ${message}`);
}

function fixtureCountSql() {
  const hmacs = fixtureHmacs.map(sqlLiteral).join(",");
  const ids = fixtureIds.map(sqlLiteral).join(",");
  return `select
    (select count(*) from public.corralio_sms_test_allowlist where destination_hmac in (${hmacs}))+
    (select count(*) from public.corralio_sms_request_rate_state where bucket_hmac in (${hmacs}))+
    (select count(*) from public.corralio_sms_request_decisions where destination_hmac in (${hmacs}) or ip_hmac in (${hmacs}))+
    (select count(*) from public.corralio_sms_phone_send_permits where destination_hmac in (${hmacs}))+
    (select count(*) from public.corralio_sms_webhook_claims where webhook_id in (${ids}) or destination_hmac in (${hmacs}))+
    (select count(*) from public.corralio_sms_daily_segment_budgets where utc_date=${sqlLiteral(fixtureDate)}::date)+
    (select count(*) from public.corralio_sms_destination_segment_budgets where utc_date=${sqlLiteral(fixtureDate)}::date or destination_hmac in (${hmacs}));`;
}

const fixtureDate = run("select (clock_timestamp() at time zone 'UTC')::date::text");
assert(run("select (extract(hour from clock_timestamp() at time zone 'UTC') <> 23 or extract(minute from clock_timestamp() at time zone 'UTC') < 55)::text") === "true", "verification cannot start within five minutes of UTC midnight");
const originalPolicy = JSON.parse(run(
  "select row_to_json(policy)::text from (select * from public.corralio_sms_test_policy where id=1) policy",
));
assert(originalPolicy && originalPolicy.id === 1, "durable test policy singleton missing");
assert(run(fixtureCountSql()) === "0", "reserved fixture namespace/date was not empty before testing");

function restorePolicySql() {
  return `update public.corralio_sms_test_policy set
    policy_version=${sqlLiteral(originalPolicy.policy_version)},
    enabled=${originalPolicy.enabled ? "true" : "false"},
    send_mode=${sqlLiteral(originalPolicy.send_mode)},
    global_daily_segment_limit=${Number(originalPolicy.global_daily_segment_limit)},
    destination_daily_segment_limit=${Number(originalPolicy.destination_daily_segment_limit)},
    max_segments_per_message=${Number(originalPolicy.max_segments_per_message)},
    phone_requests_per_hour=${Number(originalPolicy.phone_requests_per_hour)},
    ip_requests_per_hour=${Number(originalPolicy.ip_requests_per_hour)},
    resend_cooldown_seconds=${Number(originalPolicy.resend_cooldown_seconds)},
    permit_ttl_seconds=${Number(originalPolicy.permit_ttl_seconds)},
    updated_at=${sqlLiteral(originalPolicy.updated_at)}::timestamptz
    where id=1;`;
}

function cleanup() {
  const hmacs = fixtureHmacs.map(sqlLiteral).join(",");
  const ids = fixtureIds.map(sqlLiteral).join(",");
  run(`
    delete from public.corralio_sms_webhook_claims where webhook_id in (${ids}) or destination_hmac in (${hmacs});
    delete from public.corralio_sms_phone_send_permits where destination_hmac in (${hmacs});
    delete from public.corralio_sms_request_decisions where destination_hmac in (${hmacs}) or ip_hmac in (${hmacs});
    delete from public.corralio_sms_request_rate_state where bucket_hmac in (${hmacs});
    delete from public.corralio_sms_destination_segment_budgets where utc_date=${sqlLiteral(fixtureDate)}::date or destination_hmac in (${hmacs});
    delete from public.corralio_sms_daily_segment_budgets where utc_date=${sqlLiteral(fixtureDate)}::date;
    delete from public.corralio_sms_test_allowlist where destination_hmac in (${hmacs});
    ${restorePolicySql()}
  `);
}

let verificationError;
try {
  run(`update public.corralio_sms_test_policy set enabled=true where id=1;
    insert into public.corralio_sms_test_allowlist(destination_hmac) values ${fixtureHmacs.map((hmac) => `(${sqlLiteral(hmac)})`).join(",")};`);

  // Race A: the same webhook ID may authorize at most once.
  run(`${permitSql(sameHmac)}
    insert into public.corralio_sms_daily_segment_budgets values (${sqlLiteral(fixtureDate)},0,now());`);
  const sameWebhook = await Promise.all([
    concurrent(hookSql("gate3_race_same", sameHmac)),
    concurrent(hookSql("gate3_race_same", sameHmac)),
  ]);
  assert(sameWebhook.filter((value) => value === "authorized").length === 1, "Race A authorization count");
  assert(sameWebhook.filter((value) => value === "duplicate").length === 1, "Race A duplicate count");
  assert(run(`select reserved_segments from public.corralio_sms_daily_segment_budgets where utc_date=${sqlLiteral(fixtureDate)}::date`) === "1", "Race A segment count");

  // Race B: two eligible requests contend for the twentieth global segment.
  run(`update public.corralio_sms_daily_segment_budgets set reserved_segments=19 where utc_date=${sqlLiteral(fixtureDate)}::date;
    ${permitSql(globalOneHmac)}
    ${permitSql(globalTwoHmac)}`);
  const globalCap = await Promise.all([
    concurrent(hookSql("gate3_race_global_one", globalOneHmac)),
    concurrent(hookSql("gate3_race_global_two", globalTwoHmac)),
  ]);
  assert(globalCap.filter((value) => value === "authorized").length === 1, "Race B authorization count");
  assert(globalCap.filter((value) => value === "global_cap").length === 1, "Race B global-cap denial");
  assert(run(`select reserved_segments from public.corralio_sms_daily_segment_budgets where utc_date=${sqlLiteral(fixtureDate)}::date`) === "20", "Race B final global count");

  // Race C: a valid permit at the full destination cap must close, not consume.
  run(`update public.corralio_sms_daily_segment_budgets set reserved_segments=0 where utc_date=${sqlLiteral(fixtureDate)}::date;
    insert into public.corralio_sms_destination_segment_budgets values (${sqlLiteral(fixtureDate)},${sqlLiteral(destinationCapHmac)},5,now());
    ${permitSql(destinationCapHmac)}`);
  assert(finalResultRow(run(hookSql("gate3_race_destination_cap", destinationCapHmac))) === "destination_cap", "Race C decision");
  assert(run(`select count(*) from public.corralio_sms_phone_send_permits where destination_hmac=${sqlLiteral(destinationCapHmac)} and consumed_at is null and closed_at is not null and close_reason='destination_cap'`) === "1", "Race C permit terminal state");
  assert(run("select count(*) from public.corralio_sms_webhook_claims where webhook_id='gate3_race_destination_cap' and decision='destination_cap' and provider_attempt_authorized_at is null and reserved_segments=0") === "1", "Race C claim terminal state");
  assert(run(`select reserved_segments from public.corralio_sms_daily_segment_budgets where utc_date=${sqlLiteral(fixtureDate)}::date`) === "0", "Race C global counter mutation");
  assert(run(`select reserved_segments from public.corralio_sms_destination_segment_budgets where utc_date=${sqlLiteral(fixtureDate)}::date and destination_hmac=${sqlLiteral(destinationCapHmac)}`) === "5", "Race C destination counter mutation");

  // Race D: two webhook IDs contend for one permit below both budget caps.
  run(permitSql(permitRaceHmac));
  const permitRace = await Promise.all([
    concurrent(hookSql("gate3_race_permit_one", permitRaceHmac)),
    concurrent(hookSql("gate3_race_permit_two", permitRaceHmac)),
  ]);
  assert(permitRace.filter((value) => value === "authorized").length === 1, "Race D authorization count");
  assert(permitRace.filter((value) => value === "missing_permit").length === 1, "Race D bounded denial");
  assert(run(`select count(*) from public.corralio_sms_phone_send_permits where destination_hmac=${sqlLiteral(permitRaceHmac)} and consumed_at is not null and consumed_by_webhook_id in ('gate3_race_permit_one','gate3_race_permit_two')`) === "1", "Race D permit consumer count");
  assert(run(`select reserved_segments from public.corralio_sms_daily_segment_budgets where utc_date=${sqlLiteral(fixtureDate)}::date`) === "1", "Race D global segment count");
  assert(run(`select reserved_segments from public.corralio_sms_destination_segment_budgets where utc_date=${sqlLiteral(fixtureDate)}::date and destination_hmac=${sqlLiteral(permitRaceHmac)}`) === "1", "Race D destination segment count");
} catch (error) {
  verificationError = error;
}

let cleanupError;
try {
  cleanup();
} catch (error) {
  cleanupError = error;
}

let cleanupAssertionError;
try {
  assert(run(fixtureCountSql()) === "0", "cleanup zero across all eight durable-state tables");
  const restoredPolicy = JSON.parse(run(
    "select row_to_json(policy)::text from (select * from public.corralio_sms_test_policy where id=1) policy",
  ));
  assert(JSON.stringify(restoredPolicy) === JSON.stringify(originalPolicy), "exact durable test-policy restoration");
} catch (error) {
  cleanupAssertionError = error;
}

if (cleanupError) throw cleanupError;
if (cleanupAssertionError) throw cleanupAssertionError;
if (verificationError) throw verificationError;

process.stdout.write("DURABLE GATE 3 CONCURRENCY VERIFICATION PASSED; CLEANUP ZERO\n");
