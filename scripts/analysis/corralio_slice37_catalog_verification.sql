do $verify$
declare
  v_definition text;
begin
  select pg_get_constraintdef(constraint_row.oid)
    into v_definition
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.corralio_schedule_connection_events'::regclass
    and constraint_row.conname = 'corralio_schedule_connection_events_platform_check'
    and constraint_row.contype = 'c';

  if v_definition is null then
    raise exception 'Slice 3.7 catalog verification failed: platform constraint missing';
  end if;

  if not (
    v_definition like '%gamechanger%'
    and v_definition like '%teamsnap%'
    and v_definition like '%stack_team_app%'
    and v_definition like '%arbiterlive%'
    and v_definition like '%arbiter_officials%'
    and v_definition like '%other%'
  ) then
    raise exception 'Slice 3.7 catalog verification failed: approved platform missing';
  end if;

  if (
    select count(*)
    from regexp_matches(v_definition, '''([^'']+)''', 'g')
  ) <> 6 then
    raise exception 'Slice 3.7 catalog verification failed: unexpected platform value';
  end if;
end
$verify$;

select 'SLICE 3.7 CATALOG VERIFICATION PASSED'
  as corralio_slice37_catalog_verification;
