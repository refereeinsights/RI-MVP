-- Phase 1 TI venue reviews: append-only review records + venue aggregates + secure submit RPC.

create extension if not exists "pgcrypto";

create table if not exists public.venue_reviews (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  tournament_id uuid null,
  user_id uuid not null references auth.users(id) on delete cascade,
  restrooms text not null,
  restroom_cleanliness smallint not null,
  player_parking_fee numeric(10,2) not null,
  parking_convenience_score text not null,
  bring_field_chairs boolean not null,
  shade_score smallint not null,
  food_vendors boolean not null,
  coffee_vendors boolean not null,
  vendor_score smallint not null,
  venue_notes varchar(255),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_reviews_restroom_cleanliness_range check (restroom_cleanliness between 1 and 5),
  constraint venue_reviews_shade_score_range check (shade_score between 1 and 5),
  constraint venue_reviews_vendor_score_range check (vendor_score between 1 and 5),
  constraint venue_reviews_restrooms_allowed check (restrooms in ('Portable', 'Building', 'Both')),
  constraint venue_reviews_parking_convenience_allowed check (parking_convenience_score in ('Close', 'Medium', 'Far')),
  constraint venue_reviews_status_allowed check (status in ('active', 'hidden', 'flagged'))
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'venue_reviews_user_id_venue_id_key'
  ) then
    alter table public.venue_reviews
      add constraint venue_reviews_user_id_venue_id_key unique (user_id, venue_id);
  end if;
end $$;

create index if not exists venue_reviews_venue_id_idx on public.venue_reviews(venue_id);
create index if not exists venue_reviews_tournament_id_idx on public.venue_reviews(tournament_id);
create index if not exists venue_reviews_user_id_idx on public.venue_reviews(user_id);

-- Add tournament FK only when tournaments table exists.
do $$
begin
  if to_regclass('public.tournaments') is not null
    and not exists (
      select 1 from pg_constraint where conname = 'venue_reviews_tournament_id_fkey'
    ) then
    alter table public.venue_reviews
      add constraint venue_reviews_tournament_id_fkey
      foreign key (tournament_id) references public.tournaments(id) on delete set null;
  end if;
end $$;

alter table public.venues
  add column if not exists restroom_cleanliness_avg numeric(3,2),
  add column if not exists shade_score_avg numeric(3,2),
  add column if not exists vendor_score_avg numeric(3,2),
  add column if not exists review_count integer not null default 0,
  add column if not exists reviews_last_updated_at timestamptz;

create or replace function public.recompute_venue_review_aggregates(p_venue_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.venues v
  set
    restroom_cleanliness_avg = stats.restroom_cleanliness_avg,
    shade_score_avg = stats.shade_score_avg,
    vendor_score_avg = stats.vendor_score_avg,
    review_count = stats.review_count,
    reviews_last_updated_at = now()
  from (
    select
      coalesce(round(avg(vr.restroom_cleanliness)::numeric, 2), null) as restroom_cleanliness_avg,
      coalesce(round(avg(vr.shade_score)::numeric, 2), null) as shade_score_avg,
      coalesce(round(avg(vr.vendor_score)::numeric, 2), null) as vendor_score_avg,
      count(*)::integer as review_count
    from public.venue_reviews vr
    where vr.venue_id = p_venue_id
      and vr.status = 'active'
  ) as stats
  where v.id = p_venue_id;
end;
$$;

create or replace function public.handle_venue_review_aggregate_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_venue_review_aggregates(old.venue_id);
    return old;
  end if;

  perform public.recompute_venue_review_aggregates(new.venue_id);

  if tg_op = 'UPDATE' and old.venue_id is distinct from new.venue_id then
    perform public.recompute_venue_review_aggregates(old.venue_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_venue_reviews_recompute on public.venue_reviews;

create trigger trg_venue_reviews_recompute
after insert or update or delete on public.venue_reviews
for each row
execute function public.handle_venue_review_aggregate_refresh();

alter table public.venue_reviews enable row level security;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_reviews'
      and policyname = 'venue_reviews_select_authenticated'
  ) then
    drop policy venue_reviews_select_authenticated on public.venue_reviews;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_reviews'
      and policyname = 'venue_reviews_select_own'
  ) then
    create policy venue_reviews_select_own
      on public.venue_reviews
      for select
      using (
        auth.role() = 'authenticated'
        and user_id = auth.uid()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_reviews'
      and policyname = 'venue_reviews_insert_own'
  ) then
    create policy venue_reviews_insert_own
      on public.venue_reviews
      for insert
      with check (
        auth.role() = 'authenticated'
        and user_id = auth.uid()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'venue_reviews'
      and policyname = 'venue_reviews_update_own'
  ) then
    create policy venue_reviews_update_own
      on public.venue_reviews
      for update
      using (
        auth.role() = 'authenticated'
        and user_id = auth.uid()
      )
      with check (
        auth.role() = 'authenticated'
        and user_id = auth.uid()
      );
  end if;
end $$;

create or replace function public.submit_venue_review(
  p_venue_id uuid,
  p_tournament_id uuid,
  p_restrooms text,
  p_restroom_cleanliness smallint,
  p_player_parking_fee numeric,
  p_parking_convenience_score text,
  p_bring_field_chairs boolean,
  p_shade_score smallint,
  p_food_vendors boolean,
  p_coffee_vendors boolean,
  p_vendor_score smallint,
  p_venue_notes text default null
)
returns table(ok boolean, venue_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_notes text;
  v_email_confirmed_at timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select u.email_confirmed_at
  into v_email_confirmed_at
  from auth.users u
  where u.id = v_user_id;

  if v_email_confirmed_at is null then
    raise exception 'Insider required to submit venue reviews';
  end if;

  if p_restrooms not in ('Portable', 'Building', 'Both') then
    raise exception 'Invalid restrooms value';
  end if;

  if p_parking_convenience_score not in ('Close', 'Medium', 'Far') then
    raise exception 'Invalid parking convenience score';
  end if;

  if p_restroom_cleanliness < 1 or p_restroom_cleanliness > 5 then
    raise exception 'restroom_cleanliness must be between 1 and 5';
  end if;

  if p_shade_score < 1 or p_shade_score > 5 then
    raise exception 'shade_score must be between 1 and 5';
  end if;

  if p_vendor_score < 1 or p_vendor_score > 5 then
    raise exception 'vendor_score must be between 1 and 5';
  end if;

  v_notes := nullif(left(coalesce(p_venue_notes, ''), 255), '');

  insert into public.venue_reviews (
    venue_id,
    tournament_id,
    user_id,
    restrooms,
    restroom_cleanliness,
    player_parking_fee,
    parking_convenience_score,
    bring_field_chairs,
    shade_score,
    food_vendors,
    coffee_vendors,
    vendor_score,
    venue_notes,
    status,
    updated_at
  ) values (
    p_venue_id,
    p_tournament_id,
    v_user_id,
    p_restrooms,
    p_restroom_cleanliness,
    p_player_parking_fee,
    p_parking_convenience_score,
    p_bring_field_chairs,
    p_shade_score,
    p_food_vendors,
    p_coffee_vendors,
    p_vendor_score,
    v_notes,
    'active',
    now()
  )
  on conflict (user_id, venue_id)
  do update set
    tournament_id = excluded.tournament_id,
    restrooms = excluded.restrooms,
    restroom_cleanliness = excluded.restroom_cleanliness,
    player_parking_fee = excluded.player_parking_fee,
    parking_convenience_score = excluded.parking_convenience_score,
    bring_field_chairs = excluded.bring_field_chairs,
    shade_score = excluded.shade_score,
    food_vendors = excluded.food_vendors,
    coffee_vendors = excluded.coffee_vendors,
    vendor_score = excluded.vendor_score,
    venue_notes = excluded.venue_notes,
    status = 'active',
    updated_at = now();

  return query select true, p_venue_id;
end;
$$;

grant execute on function public.submit_venue_review(
  uuid,
  uuid,
  text,
  smallint,
  numeric,
  text,
  boolean,
  smallint,
  boolean,
  boolean,
  smallint,
  text
) to authenticated;

grant execute on function public.recompute_venue_review_aggregates(uuid) to authenticated, service_role;
