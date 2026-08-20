-- Corralio Slice 4.0A: bound the existing private-team sport field to the
-- product's canonical presentation taxonomy. Children, teams, household
-- ownership, assignment columns, and lifecycle behavior already exist.

do $preflight$
declare
  v_incompatible_count bigint;
  v_incompatible_values text;
begin
  select count(*), string_agg(distinct sport, ', ' order by sport)
  into v_incompatible_count, v_incompatible_values
  from public.corralio_teams
  where sport is not null
    and sport not in (
      'baseball', 'softball', 'soccer', 'basketball', 'volleyball',
      'hockey', 'lacrosse', 'football', 'other'
    );

  if v_incompatible_count > 0 then
    raise exception
      'Corralio Slice 4.0A preflight failed: % team rows use unsupported sport values (%)',
      v_incompatible_count,
      left(coalesce(v_incompatible_values, ''), 500);
  end if;
end;
$preflight$;

alter table public.corralio_teams
  drop constraint corralio_teams_sport_check;

alter table public.corralio_teams
  add constraint corralio_teams_sport_check
  check (
    sport is null
    or sport in (
      'baseball', 'softball', 'soccer', 'basketball', 'volleyball',
      'hockey', 'lacrosse', 'football', 'other'
    )
  );

comment on column public.corralio_teams.sport is
  'Optional private household team presentation category. It does not assign or overwrite an ICS schedule source.';
