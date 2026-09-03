-- Network-free, rollback-only Phase A+B behavior verification.
begin;

create or replace function pg_temp.corralio_phase_ab_assert(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin if p_condition is not true then raise exception 'Phase A+B verification failed: %', p_message; end if; end;
$function$;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','ab000000-0000-4000-8000-000000000001',
 'authenticated','authenticated','phase-ab-owner@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
('00000000-0000-0000-0000-000000000000','ab000000-0000-4000-8000-000000000002',
 'authenticated','authenticated','phase-ab-other@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
insert into public.corralio_households(id,display_name) values
('ab000000-0000-4000-8000-000000000011','Phase AB'),
('ab000000-0000-4000-8000-000000000012','Other');
insert into public.corralio_household_members(household_id,user_id) values
('ab000000-0000-4000-8000-000000000011','ab000000-0000-4000-8000-000000000001'),
('ab000000-0000-4000-8000-000000000012','ab000000-0000-4000-8000-000000000002');
insert into public.corralio_children(id,household_id,display_name,color_token) values
('ab000000-0000-4000-8000-000000000021','ab000000-0000-4000-8000-000000000011','Child','forest');
insert into public.corralio_teams(id,household_id,child_id,display_name) values
('ab000000-0000-4000-8000-000000000031','ab000000-0000-4000-8000-000000000011',
 'ab000000-0000-4000-8000-000000000021','Team');

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);

select public.corralio_upsert_channel_identity_v1(
  'ab000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000011',
  'phone',repeat('a',64));
select pg_temp.corralio_phase_ab_assert((select count(*) = 1 from
  public.corralio_resolve_channel_identity_v1('phone',repeat('a',64))), 'verified identity did not resolve');

select pg_temp.corralio_phase_ab_assert((select decision = 'claimed' from
  public.corralio_claim_telnyx_inbound_v1('phase_ab_event_1')), 'event not claimed');
select pg_temp.corralio_phase_ab_assert((select decision = 'duplicate' from
  public.corralio_claim_telnyx_inbound_v1('phase_ab_event_1')), 'duplicate not rejected');

select pg_temp.corralio_phase_ab_assert((select created from
  public.corralio_create_pending_schedule_intake_v1(
    'ab000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000011',
    '{"v":1,"alg":"A256GCM","kid":"v1","iv":"fixture","ct":"fixture","tag":"fixture"}',
    'v1:' || repeat('b',64),array['ab000000-0000-4000-8000-000000000031'::uuid],array[]::uuid[])),
  'pending intake not created');
select pg_temp.corralio_phase_ab_assert((select not created from
  public.corralio_create_pending_schedule_intake_v1(
    'ab000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000011',
    'different-envelope','v1:' || repeat('b',64),
    array['ab000000-0000-4000-8000-000000000031'::uuid],array[]::uuid[])),
  'pending fingerprint was not idempotent');

create temporary table claimed_pending as select * from
  public.corralio_claim_pending_schedule_resolution_v1(
    'ab000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000011',
    'phase_ab_event_2',1);
select pg_temp.corralio_phase_ab_assert((select target_kind = 'team' from claimed_pending),
  'pending team choice not claimed');
select public.corralio_finalize_pending_schedule_intake_v1(
  (select intake_id from claimed_pending),'phase_ab_event_2','resolved',null);
reset role;
select pg_temp.corralio_phase_ab_assert((select url_envelope is null and state = 'resolved'
  from public.corralio_pending_schedule_intakes where url_fingerprint = 'v1:' || repeat('b',64)),
  'terminal pending secret not cleared');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $denials$
begin
  begin
    perform public.corralio_resolve_channel_identity_v1('phone',repeat('a',64));
    raise exception using errcode='P0001',message='authenticated execution unexpectedly succeeded';
  exception when sqlstate 'P0001' then raise; when insufficient_privilege then null; end;
end
$denials$;
reset role;

rollback;

do $cleanup$
begin
  if exists(select 1 from auth.users where id::text like 'ab000000-%')
    or exists(select 1 from public.corralio_households where id::text like 'ab000000-%')
    or exists(select 1 from public.corralio_channel_identities where address_hmac = repeat('a',64))
    or exists(select 1 from public.corralio_telnyx_inbound_claims where event_id like 'phase_ab_event_%')
    or exists(select 1 from public.corralio_pending_schedule_intakes where url_fingerprint = 'v1:' || repeat('b',64)) then
    raise exception 'Phase A+B behavioral verification failed: rollback cleanup';
  end if;
end
$cleanup$;

select 'CORRALIO PHASE A+B BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO'
  as corralio_phase_ab_behavioral_verification;
