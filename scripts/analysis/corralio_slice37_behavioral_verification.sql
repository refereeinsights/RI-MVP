begin;

do $verify$
declare
  v_user uuid := 'c3700000-0000-4000-8000-000000000001';
  v_household uuid := 'c3700000-0000-4000-8000-000000000002';
  v_count bigint;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (v_user, 'authenticated', 'authenticated', 'slice37-fixture@example.invalid', now(), now());
  insert into public.corralio_households (id, display_name)
  values (v_household, 'Slice 3.7 fixture');
  insert into public.corralio_household_members (household_id, user_id, role, status)
  values (v_household, v_user, 'owner', 'active');

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  perform public.corralio_record_schedule_connection_event_v1(
    'platform_selected', 'arbiterlive', null
  );
  perform public.corralio_record_schedule_connection_event_v1(
    'platform_selected', 'arbiter_officials', null
  );

  select count(*) into v_count
  from public.corralio_schedule_connection_events
  where household_id = v_household
    and platform in ('arbiterlive', 'arbiter_officials');

  if v_count <> 2 then
    raise exception 'Slice 3.7 behavioral verification failed: Arbiter platforms not recorded';
  end if;
end
$verify$;

rollback;

do $cleanup$
begin
  if exists (select 1 from auth.users where id = 'c3700000-0000-4000-8000-000000000001')
     or exists (select 1 from public.corralio_households where id = 'c3700000-0000-4000-8000-000000000002')
     or exists (
       select 1 from public.corralio_schedule_connection_events
       where household_id = 'c3700000-0000-4000-8000-000000000002'
     )
  then raise exception 'Slice 3.7 behavioral verification failed: rollback cleanup'; end if;
end
$cleanup$;

select 'SLICE 3.7 BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO'
  as corralio_slice37_behavioral_verification;
