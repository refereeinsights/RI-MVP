begin;

do $verify$
declare
  v_household uuid := 'c3550000-0000-4000-8000-000000000001';
  v_other_household uuid := 'c3550000-0000-4000-8000-000000000002';
  v_source uuid := 'c3550000-0000-4000-8000-000000000011';
  v_other_source uuid := 'c3550000-0000-4000-8000-000000000012';
  v_outcome text;
  v_claim_token uuid;
  v_private_url text;
  v_claimed_ids uuid[];
  v_failure integer;
  v_started timestamptz;
  v_paused timestamptz;
begin
  insert into public.corralio_households (id, display_name) values
    (v_household, 'Slice 3.5.5 fixture'),
    (v_other_household, 'Slice 3.5.5 other fixture');
  insert into public.corralio_schedule_sources (
    id, household_id, source_type, display_name, source_url, sync_status,
    last_synced_at, last_refresh_attempted_at
  ) values
    (v_source, v_household, 'ics', 'Fixture schedule', 'https://example.invalid/slice355.ics', 'success', now(), now() - interval '6 minutes'),
    (v_other_source, v_other_household, 'ics', 'Other fixture', 'https://example.invalid/slice355-other.ics', 'success', now(), now() - interval '6 minutes');

  perform set_config('request.jwt.claim.role', 'service_role', true);

  select result.outcome, result.claim_token, result.source_url
    into v_outcome, v_claim_token, v_private_url
  from public.corralio_claim_ics_refresh_source_v1(v_household, v_source) result;
  if v_outcome <> 'claimed' or v_claim_token is null or v_private_url is null
  then raise exception 'manual own-source claim failed'; end if;

  select result.outcome into v_outcome
  from public.corralio_claim_ics_refresh_source_v1(v_household, v_other_source) result;
  if v_outcome <> 'unavailable'
  then raise exception 'cross-household source was not hidden'; end if;

  select result.outcome into v_outcome
  from public.corralio_claim_ics_refresh_source_v1(v_household, v_source) result;
  if v_outcome <> 'busy'
  then raise exception 'live claim was not busy'; end if;

  if not public.corralio_fail_claimed_ics_refresh_v1(v_source, v_claim_token, 'fetch_failed')
  then raise exception 'claimed failure was not finalized'; end if;
  select result.outcome into v_outcome
  from public.corralio_claim_ics_refresh_source_v1(v_household, v_source) result;
  if v_outcome <> 'cooldown'
  then raise exception 'manual cooldown failed'; end if;

  update public.corralio_schedule_sources
  set last_refresh_attempted_at = now() - interval '6 minutes'
  where id = v_source;
  select result.outcome, result.claim_token into v_outcome, v_claim_token
  from public.corralio_claim_ics_refresh_source_v1(v_household, v_source) result;
  if v_outcome <> 'claimed' or v_claim_token is null
  then raise exception 'manual cooldown did not expire'; end if;
  perform public.corralio_fail_claimed_ics_refresh_v1(v_source, v_claim_token, 'fetch_failed');

  update public.corralio_schedule_sources
  set last_refresh_attempted_at = now() - interval '6 minutes'
  where id = v_source;
  select result.claim_token into v_claim_token
  from public.corralio_claim_ics_refresh_source_v1(v_household, v_source) result;
  perform public.corralio_fail_claimed_ics_refresh_v1(v_source, v_claim_token, 'fetch_failed');
  select consecutive_refresh_failures, refresh_failure_started_at, refresh_paused_at
    into v_failure, v_started, v_paused
  from public.corralio_schedule_sources where id = v_source;
  if v_failure <> 3 or v_started is null or v_paused is not null
  then raise exception 'three fast failures paused before minimum elapsed time'; end if;

  update public.corralio_schedule_sources
  set refresh_failure_started_at = now() - interval '25 hours',
      last_refresh_attempted_at = now() - interval '6 minutes'
  where id = v_source;
  select result.claim_token into v_claim_token
  from public.corralio_claim_ics_refresh_source_v1(v_household, v_source) result;
  perform public.corralio_fail_claimed_ics_refresh_v1(v_source, v_claim_token, 'fetch_failed');
  select refresh_paused_at into v_paused
  from public.corralio_schedule_sources where id = v_source;
  if v_paused is null then raise exception 'elapsed failure sequence did not pause'; end if;
  select result.outcome into v_outcome
  from public.corralio_claim_ics_refresh_source_v1(v_household, v_source) result;
  if v_outcome <> 'paused' then raise exception 'paused manual outcome failed'; end if;

  -- Keep every non-fixture row ineligible inside this rollback-only transaction,
  -- then prove that the automatic claim uses the three-hour boundary.
  update public.corralio_schedule_sources
  set last_refresh_attempted_at = now()
  where id not in (v_source, v_other_source);
  update public.corralio_schedule_sources
  set last_refresh_attempted_at = now() - interval '4 hours'
  where id = v_other_source;
  select array_agg(result.source_id order by result.source_id) into v_claimed_ids
  from public.corralio_claim_ics_refresh_batch_v1(10) result;
  if v_claimed_ids is distinct from array[v_other_source]
  then raise exception 'automatic three-hour claim boundary failed'; end if;
end
$verify$;

rollback;

do $cleanup$
begin
  if exists (select 1 from public.corralio_schedule_sources where id = any (array[
    'c3550000-0000-4000-8000-000000000011',
    'c3550000-0000-4000-8000-000000000012'
  ]::uuid[]))
     or exists (select 1 from public.corralio_households where id = any (array[
       'c3550000-0000-4000-8000-000000000001',
       'c3550000-0000-4000-8000-000000000002'
     ]::uuid[]))
  then raise exception 'Slice 3.5.5 behavioral verification failed: rollback cleanup'; end if;
end
$cleanup$;

select 'SLICE 3.5.5 BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO'
  as corralio_slice355_behavioral_verification;
