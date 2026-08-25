-- Corralio Slice 4.4 rollback-only behavioral verification.
-- Run only after a human applies the migration. This script performs no DNS,
-- HTTP, vendor, cron, or other outbound request and always ends in ROLLBACK.

begin;

create or replace function pg_temp.corralio_slice44_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $function$
begin
  if p_condition is not true then
    raise exception 'Corralio Slice 4.4 verification failed: %', p_message;
  end if;
end;
$function$;

insert into public.corralio_households (id, display_name) values
  ('c4400000-0000-4000-8000-000000000011', 'Slice 4.4 Household A'),
  ('c4400000-0000-4000-8000-000000000012', 'Slice 4.4 Household B');

insert into public.corralio_events (
  id, household_id, origin_type, title, starts_at, display_location_text
) values
  ('c4400000-0000-4000-8000-000000000021', 'c4400000-0000-4000-8000-000000000011', 'manual', 'Matched', now() + interval '1 day', 'Public venue A'),
  ('c4400000-0000-4000-8000-000000000022', 'c4400000-0000-4000-8000-000000000011', 'manual', 'Unmatched', now() + interval '1 day', 'Public venue B'),
  ('c4400000-0000-4000-8000-000000000023', 'c4400000-0000-4000-8000-000000000011', 'manual', 'Private', now() + interval '1 day', 'Private fixture'),
  ('c4400000-0000-4000-8000-000000000024', 'c4400000-0000-4000-8000-000000000011', 'manual', 'Insufficient', now() + interval '1 day', 'Field 1'),
  ('c4400000-0000-4000-8000-000000000025', 'c4400000-0000-4000-8000-000000000012', 'manual', 'Other household', now() + interval '1 day', 'Other fixture');

insert into public.corralio_event_venue_matches (
  event_id, household_id, venue_id, match_status, location_fingerprint,
  matcher_version, evaluated_at, matched_at, recheck_after
) values
  ('c4400000-0000-4000-8000-000000000021', 'c4400000-0000-4000-8000-000000000011', 'c4400000-0000-4000-8000-000000000099', 'matched', repeat('a', 64), 'corralio-v1', now(), now(), null),
  ('c4400000-0000-4000-8000-000000000022', 'c4400000-0000-4000-8000-000000000011', null, 'unmatched', repeat('b', 64), 'corralio-v1', now(), null, now() + interval '30 days'),
  ('c4400000-0000-4000-8000-000000000023', 'c4400000-0000-4000-8000-000000000011', null, 'private_skipped', repeat('c', 64), 'corralio-v1', now(), null, null),
  ('c4400000-0000-4000-8000-000000000024', 'c4400000-0000-4000-8000-000000000011', null, 'insufficient_location', repeat('d', 64), 'corralio-v1', now(), null, null);

select pg_temp.corralio_slice44_assert(
  (select count(*) = 4 from public.corralio_event_venue_matches where household_id = 'c4400000-0000-4000-8000-000000000011'),
  'all four coherent match states were not stored'
);

do $test$
begin
  begin
    insert into public.corralio_event_venue_matches values (
      'c4400000-0000-4000-8000-000000000025',
      'c4400000-0000-4000-8000-000000000011',
      null, 'unmatched', repeat('e', 64), 'corralio-v1', now(), null, now() + interval '30 days'
    );
    raise exception using errcode = 'P0001', message = 'cross-household event relationship unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when foreign_key_violation then null; end;

  begin
    insert into public.corralio_event_venue_matches values (
      'c4400000-0000-4000-8000-000000000025',
      'c4400000-0000-4000-8000-000000000012',
      null, 'matched', repeat('e', 64), 'corralio-v1', now(), null, null
    );
    raise exception using errcode = 'P0001', message = 'matched state without venue/timestamp unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when check_violation then null; end;

  begin
    insert into public.corralio_event_venue_matches values (
      'c4400000-0000-4000-8000-000000000025',
      'c4400000-0000-4000-8000-000000000012',
      null, 'unmatched', 'not-a-fingerprint', 'corralio-v1', now(), null, now() + interval '30 days'
    );
    raise exception using errcode = 'P0001', message = 'invalid fingerprint unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when check_violation then null; end;
end;
$test$;

set local role authenticated;
do $test$
begin
  begin
    perform count(*) from public.corralio_event_venue_matches;
    raise exception using errcode = 'P0001', message = 'authenticated read unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when insufficient_privilege then null; end;
end;
$test$;
reset role;

delete from public.corralio_events
where id = 'c4400000-0000-4000-8000-000000000021';

select pg_temp.corralio_slice44_assert(
  not exists (select 1 from public.corralio_event_venue_matches where event_id = 'c4400000-0000-4000-8000-000000000021'),
  'event deletion did not cascade to its match result'
);
select pg_temp.corralio_slice44_assert(
  (select count(*) = 3 from public.corralio_event_venue_matches where household_id = 'c4400000-0000-4000-8000-000000000011'),
  'cascade affected unrelated fixture match rows'
);

rollback;

-- Expected final command: ROLLBACK. Fixed IDs plus the transaction ensure no
-- pre-existing household, event, venue, identity, or match row is altered.
