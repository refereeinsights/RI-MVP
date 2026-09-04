-- Network-free, rollback-only Slice 3.6B Phase 3A behavioral verification.
begin;

create or replace function pg_temp.corralio_slice36b_phase3a_assert(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if p_condition is not true then
    raise exception 'Corralio Slice 3.6B Phase 3A verification failed: %', p_message;
  end if;
end;
$function$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000','c3a00000-0000-4000-8000-000000000001','authenticated','authenticated','phase3a-owner@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','c3a00000-0000-4000-8000-000000000002','authenticated','authenticated','phase3a-other@example.invalid','',now(),'{}','{}',now(),now());

insert into public.corralio_households (id, display_name, origin_address, origin_lat, origin_lng, origin_geocoded_at) values
  ('c3a00000-0000-4000-8000-000000000011','Phase 3A Household','Private Home',47.60,-117.40,now()),
  ('c3a00000-0000-4000-8000-000000000012','Phase 3A Other Household','Other Home',47.61,-117.41,now());
insert into public.corralio_household_members (household_id,user_id,role,status) values
  ('c3a00000-0000-4000-8000-000000000011','c3a00000-0000-4000-8000-000000000001','owner','active'),
  ('c3a00000-0000-4000-8000-000000000012','c3a00000-0000-4000-8000-000000000002','owner','active');
insert into public.corralio_events (
  id,household_id,origin_type,title,starts_at,ends_at,display_location_text
) values
  ('c3a00000-0000-4000-8000-000000000021','c3a00000-0000-4000-8000-000000000011','manual','Active Event',now()+interval '2 days',now()+interval '2 days 2 hours','Fixture venue'),
  ('c3a00000-0000-4000-8000-000000000022','c3a00000-0000-4000-8000-000000000012','manual','Other Event',now()+interval '2 days',now()+interval '2 days 2 hours','Other fixture venue');
update public.corralio_events set location_lat=47.70,location_lng=-117.50,location_geocoded_at=now()
where id in ('c3a00000-0000-4000-8000-000000000021','c3a00000-0000-4000-8000-000000000022');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c3a00000-0000-4000-8000-000000000001',true);

select pg_temp.corralio_slice36b_phase3a_assert(
  public.corralio_prepare_event_routing_origin_v1(
    'c3a00000-0000-4000-8000-000000000021','  Alternate   Address  '
  ) = 'c3a00000-0000-4000-8000-000000000011'::uuid,
  'owner could not prepare its event override'
);

do $expected_denials$
begin
  begin
    perform public.corralio_prepare_event_routing_origin_v1(
      'c3a00000-0000-4000-8000-000000000022','Cross household address'
    );
    raise exception using errcode='P0001', message='cross-household prepare unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when insufficient_privilege then null; end;
  begin
    insert into public.corralio_event_routing_origins(household_id,event_id,origin_address)
    values ('c3a00000-0000-4000-8000-000000000011','c3a00000-0000-4000-8000-000000000021','Direct write');
    raise exception using errcode='P0001', message='direct authenticated insert unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when insufficient_privilege then null; end;
end;
$expected_denials$;

select pg_temp.corralio_slice36b_phase3a_assert(
  (select count(*)=1 from public.corralio_event_routing_origins),
  'owner select did not return exactly its own override'
);
reset role;

select pg_temp.corralio_slice36b_phase3a_assert(
  (select origin_address='Alternate Address' from public.corralio_event_routing_origins
   where event_id='c3a00000-0000-4000-8000-000000000021'),
  'address normalization failed'
);
select pg_temp.corralio_slice36b_phase3a_assert(
  (select origin_address='Private Home' and origin_lat=47.60 and origin_lng=-117.40
   from public.corralio_households where id='c3a00000-0000-4000-8000-000000000011'),
  'temporary override mutated Home'
);

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.corralio_slice36b_phase3a_assert(
  public.corralio_claim_current_location_route_v1(
    'c3a00000-0000-4000-8000-000000000011','c3a00000-0000-4000-8000-000000000021','c3a00000-0000-4000-8000-000000000031'
  ), 'first current-location claim failed'
);
select pg_temp.corralio_slice36b_phase3a_assert(
  not public.corralio_claim_current_location_route_v1(
    'c3a00000-0000-4000-8000-000000000011','c3a00000-0000-4000-8000-000000000021','c3a00000-0000-4000-8000-000000000032'
  ), 'duplicate current-location claim succeeded'
);
select public.corralio_release_current_location_route_v1(
  'c3a00000-0000-4000-8000-000000000011','c3a00000-0000-4000-8000-000000000021','c3a00000-0000-4000-8000-000000000031'
);
reset role;

-- A reschedule changes lifecycle truth: cleanup reads current event timing and
-- does not rely on an expiry copied when the override was created.
update public.corralio_events
set starts_at=now()-interval '3 days', ends_at=now()-interval '2 days'
where id='c3a00000-0000-4000-8000-000000000021';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.corralio_cleanup_event_routing_origins_v1(10);
reset role;
select pg_temp.corralio_slice36b_phase3a_assert(
  not exists (select 1 from public.corralio_event_routing_origins where event_id='c3a00000-0000-4000-8000-000000000021'),
  'rescheduled expired override was not hard-deleted'
);
select pg_temp.corralio_slice36b_phase3a_assert(
  not exists (select 1 from public.corralio_current_location_route_claims),
  'payload-free claims remained after release'
);

rollback;

do $cleanup$
begin
  if exists (select 1 from auth.users where id in ('c3a00000-0000-4000-8000-000000000001','c3a00000-0000-4000-8000-000000000002'))
     or exists (select 1 from public.corralio_households where id in ('c3a00000-0000-4000-8000-000000000011','c3a00000-0000-4000-8000-000000000012'))
     or exists (select 1 from public.corralio_events where id in ('c3a00000-0000-4000-8000-000000000021','c3a00000-0000-4000-8000-000000000022'))
     or exists (select 1 from public.corralio_event_routing_origins where event_id in ('c3a00000-0000-4000-8000-000000000021','c3a00000-0000-4000-8000-000000000022'))
     or exists (select 1 from public.corralio_current_location_route_claims where event_id in ('c3a00000-0000-4000-8000-000000000021','c3a00000-0000-4000-8000-000000000022'))
  then raise exception 'Slice 3.6B Phase 3A behavioral verification failed: rollback cleanup'; end if;
end;
$cleanup$;

select 'SLICE 3.6B PHASE 3A BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO'
  as corralio_slice36b_phase3a_behavioral_verification;
