-- Demo reviews: add flags + include in public views
alter table public.tournament_referee_reviews
  add column if not exists is_demo boolean not null default false,
  add column if not exists pinned_rank integer;

alter table public.school_referee_reviews
  add column if not exists is_demo boolean not null default false,
  add column if not exists pinned_rank integer;

create index if not exists tournament_referee_reviews_demo_idx
  on public.tournament_referee_reviews (is_demo, pinned_rank);

create index if not exists school_referee_reviews_demo_idx
  on public.school_referee_reviews (is_demo, pinned_rank);

create or replace view public.tournament_referee_reviews_public as
select
  r.id,
  r.tournament_id,
  r.created_at,
  case when r.is_demo then 'RefereeInsights Demo' else p.handle end as reviewer_handle,
  case when r.is_demo then null else nullif(p.years_refereeing::text, '') end as reviewer_level,
  r.worked_games,
  r.overall_score,
  r.logistics_score,
  r.facilities_score,
  r.pay_score,
  r.support_score,
  r.shift_detail,
  r.is_demo,
  r.pinned_rank
from public.tournament_referee_reviews r
left join public.profiles p on p.user_id = r.user_id
where (r.status = 'approved') or (r.is_demo = true);

create or replace view public.school_referee_reviews_public as
select
  r.id,
  r.school_id,
  r.created_at,
  case when r.is_demo then 'RefereeInsights Demo' else p.handle end as reviewer_handle,
  case when r.is_demo then null else nullif(p.years_refereeing::text, '') end as reviewer_level,
  r.worked_games,
  r.overall_score,
  r.logistics_score,
  r.facilities_score,
  r.pay_score,
  r.support_score,
  r.sideline_score,
  r.shift_detail,
  s.name as school_name,
  s.city as school_city,
  s.state as school_state,
  r.sport,
  r.is_demo,
  r.pinned_rank
from public.school_referee_reviews r
left join public.profiles p on p.user_id = r.user_id
left join public.schools s on s.id = r.school_id
where (r.status = 'approved') or (r.is_demo = true);

alter view public.tournament_referee_reviews_public set (security_invoker = true);
alter view public.school_referee_reviews_public set (security_invoker = true);

do $$
declare
  demo_tournament_id uuid;
begin
  select id
  into demo_tournament_id
  from public.tournaments
  where slug = 'refereeinsights-demo-tournament'
  limit 1;

  if demo_tournament_id is null then
    insert into public.tournaments (
      name,
      slug,
      sport,
      level,
      state,
      city,
      venue,
      address,
      start_date,
      end_date,
      summary,
      status,
      is_canonical
    )
    values (
      'RefereeInsights Demo Tournament',
      'refereeinsights-demo-tournament',
      'soccer',
      'youth',
      'WA',
      'Seattle',
      'RefereeInsights Field',
      '123 Demo Ave, Seattle, WA',
      (current_date + interval '30 days')::date,
      (current_date + interval '32 days')::date,
      'Demo tournament used to showcase sample reviews.',
      'published',
      true
    )
    returning id into demo_tournament_id;
  end if;

  if not exists (
    select 1 from public.tournament_referee_reviews
    where tournament_id = demo_tournament_id and is_demo = true
  ) then
    insert into public.tournament_referee_reviews (
      tournament_id,
      user_id,
      status,
      is_demo,
      pinned_rank,
      overall_score,
      logistics_score,
      facilities_score,
      pay_score,
      support_score,
      worked_games,
      shift_detail
    ) values (
      demo_tournament_id,
      null,
      'approved',
      true,
      1,
      4,
      4,
      3,
      4,
      4,
      3,
      'Sample Review\nThis is a sample review to show what becomes available after you sign up. The tournament was organized, schedules were clear, and communication was timely. Field conditions were solid and payment details were posted in advance.'
    );
  end if;
end $$;
