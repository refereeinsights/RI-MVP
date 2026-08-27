-- Corralio Slice 3.4: bounded, household-private schedule connection interactions.
-- Successful imports and activation remain derived from schedule/event/engagement state.

create table public.corralio_schedule_connection_events (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.corralio_households(id) on delete cascade,
  event_name text not null,
  platform text not null,
  reason text not null default 'none',
  occurred_minute timestamptz not null default date_trunc('minute', now()),
  occurred_at timestamptz not null default now(),
  constraint corralio_schedule_connection_events_name_check check (event_name in (
    'platform_selected', 'instructions_viewed',
    'link_submission_failed', 'feed_validation_failed'
  )),
  constraint corralio_schedule_connection_events_platform_check check (platform in (
    'gamechanger', 'teamsnap', 'stack_team_app', 'other'
  )),
  constraint corralio_schedule_connection_events_reason_check check (reason in (
    'none', 'missing_url', 'invalid_sport', 'invalid_url', 'unsupported_protocol',
    'private_url', 'fetch_failed', 'not_ics', 'too_large', 'no_events',
    'already_connected', 'needs_replacement', 'unauthorized', 'persistence',
    'temporary_failure'
  )),
  constraint corralio_schedule_connection_events_reason_shape_check check (
    (event_name in ('platform_selected', 'instructions_viewed') and reason = 'none')
    or
    (event_name in ('link_submission_failed', 'feed_validation_failed') and reason <> 'none')
  ),
  constraint corralio_schedule_connection_events_minute_check check (
    occurred_minute = date_trunc('minute', occurred_minute)
  ),
  constraint corralio_schedule_connection_events_dedupe_unique unique (
    household_id, event_name, platform, reason, occurred_minute
  )
);

create index corralio_schedule_connection_events_household_time_idx
  on public.corralio_schedule_connection_events (household_id, occurred_at desc);
create index corralio_schedule_connection_events_name_time_idx
  on public.corralio_schedule_connection_events (event_name, occurred_at desc);

comment on table public.corralio_schedule_connection_events is
  'Bounded household-private schedule-connection interactions only; contains no URL, feed data, event data, account identifier, or arbitrary payload. V1 retention is 180 days and is enforced for a household whenever it records another interaction.';

alter table public.corralio_schedule_connection_events enable row level security;
alter table public.corralio_schedule_connection_events force row level security;
alter table public.corralio_schedule_connection_events owner to postgres;
revoke all on table public.corralio_schedule_connection_events from public, anon, authenticated;
grant select, insert on table public.corralio_schedule_connection_events to service_role;

create function public.corralio_record_schedule_connection_event_v1(
  p_event_name text,
  p_platform text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_household_id uuid;
  v_event_name text := lower(btrim(coalesce(p_event_name, '')));
  v_platform text := lower(btrim(coalesce(p_platform, '')));
  v_reason text := lower(btrim(coalesce(p_reason, 'none')));
  v_now timestamptz := now();
begin
  if auth.uid() is null then return; end if;

  select member.household_id into v_household_id
  from public.corralio_household_members member
  where member.user_id = auth.uid()
    and member.role = 'owner'
    and member.status = 'active'
  limit 1;
  if v_household_id is null then return; end if;

  delete from public.corralio_schedule_connection_events
  where household_id = v_household_id
    and occurred_at < v_now - interval '180 days';

  insert into public.corralio_schedule_connection_events (
    household_id, event_name, platform, reason, occurred_minute, occurred_at
  ) values (
    v_household_id, v_event_name, v_platform, v_reason,
    date_trunc('minute', v_now), v_now
  )
  on conflict (household_id, event_name, platform, reason, occurred_minute) do nothing;
end;
$function$;

revoke all on function public.corralio_record_schedule_connection_event_v1(text,text,text)
  from public, anon;
grant execute on function public.corralio_record_schedule_connection_event_v1(text,text,text)
  to authenticated, service_role;
alter function public.corralio_record_schedule_connection_event_v1(text,text,text)
  owner to postgres;

comment on function public.corralio_record_schedule_connection_event_v1(text,text,text) is
  'Authenticated-owner-only, minute-deduplicated insertion of one bounded schedule-connection interaction.';
