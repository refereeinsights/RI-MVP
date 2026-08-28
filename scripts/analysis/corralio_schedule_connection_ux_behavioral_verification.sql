begin;

do $verify$
declare
  v_user uuid := 'c3800000-0000-4000-8000-000000000001';
  v_household uuid := 'c3800000-0000-4000-8000-000000000002';
  v_platform text;
  v_count bigint;
  v_rejected boolean := false;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (v_user, 'authenticated', 'authenticated', 'schedule-ux-fixture@example.invalid', now(), now());
  insert into public.corralio_households (id, display_name)
  values (v_household, 'Schedule UX fixture');
  insert into public.corralio_household_members (household_id, user_id, role, status)
  values (v_household, v_user, 'owner', 'active');

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  foreach v_platform in array array[
    'gamechanger', 'teamsnap', 'stack_team_app', 'arbiterlive',
    'arbiter_officials', 'leagueapps', 'other'
  ] loop
    perform public.corralio_record_schedule_connection_event_v1(
      'platform_selected', v_platform, null
    );
  end loop;

  select count(*) into v_count
  from public.corralio_schedule_connection_events
  where household_id = v_household;

  if v_count <> 7 then
    raise exception 'Schedule connection UX behavioral verification failed: approved platforms not recorded';
  end if;

  begin
    perform public.corralio_record_schedule_connection_event_v1(
      'platform_selected', 'unapproved_platform', null
    );
  exception when check_violation then
    v_rejected := true;
  end;

  if not v_rejected then
    raise exception 'Schedule connection UX behavioral verification failed: arbitrary platform accepted';
  end if;
end
$verify$;

rollback;

do $cleanup$
begin
  if exists (select 1 from auth.users where id = 'c3800000-0000-4000-8000-000000000001')
     or exists (select 1 from public.corralio_households where id = 'c3800000-0000-4000-8000-000000000002')
     or exists (
       select 1 from public.corralio_schedule_connection_events
       where household_id = 'c3800000-0000-4000-8000-000000000002'
     )
  then raise exception 'Schedule connection UX behavioral verification failed: rollback cleanup'; end if;
end
$cleanup$;

select 'SCHEDULE CONNECTION UX BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO'
  as corralio_schedule_connection_ux_behavioral_verification;
