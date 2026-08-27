begin;

do $verify$
declare
  v_user uuid := 'c3400000-0000-4000-8000-000000000001';
  v_household uuid := 'c3400000-0000-4000-8000-000000000002';
  v_before bigint;
  v_after bigint;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (v_user, 'authenticated', 'authenticated', 'slice34-fixture@example.invalid', now(), now());
  insert into public.corralio_households (id, display_name)
  values (v_household, 'Slice 3.4 fixture');
  insert into public.corralio_household_members (household_id, user_id, role, status)
  values (v_household, v_user, 'owner', 'active');

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  perform public.corralio_record_schedule_connection_event_v1('platform_selected', 'gamechanger', null);
  perform public.corralio_record_schedule_connection_event_v1('platform_selected', 'gamechanger', null);
  select count(*) into v_before
  from public.corralio_schedule_connection_events
  where household_id = v_household;
  if v_before <> 1 then raise exception 'minute dedupe failed'; end if;

  perform public.corralio_record_schedule_connection_event_v1('feed_validation_failed', 'gamechanger', 'not_ics');
  select count(*) into v_after
  from public.corralio_schedule_connection_events
  where household_id = v_household;
  if v_after <> 2 then raise exception 'bounded failure interaction failed'; end if;

  begin
    perform public.corralio_record_schedule_connection_event_v1('events_imported', 'gamechanger', null);
    raise exception 'derived activation event unexpectedly accepted';
  exception when check_violation then null;
  end;

  begin
    perform public.corralio_record_schedule_connection_event_v1('platform_selected', 'arbitrary', null);
    raise exception 'arbitrary platform unexpectedly accepted';
  exception when check_violation then null;
  end;
end
$verify$;

rollback;

do $cleanup$
begin
  if exists (select 1 from auth.users where id = 'c3400000-0000-4000-8000-000000000001')
     or exists (select 1 from public.corralio_households where id = 'c3400000-0000-4000-8000-000000000002')
     or exists (
       select 1 from public.corralio_schedule_connection_events
       where household_id = 'c3400000-0000-4000-8000-000000000002'
     )
  then raise exception 'Slice 3.4 behavioral verification failed: rollback cleanup'; end if;
end
$cleanup$;

select 'SLICE 3.4 BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO'
  as corralio_slice34_behavioral_verification;
