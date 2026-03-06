create table if not exists public.school_referee_scores_by_sport (
  school_id uuid not null references public.schools(id) on delete cascade,
  sport text not null,
  ai_score integer,
  review_count integer not null default 0,
  summary text,
  status text not null default 'clear',
  updated_at timestamptz not null default now(),
  primary key (school_id, sport)
);

create index if not exists school_referee_scores_by_sport_school_idx
  on public.school_referee_scores_by_sport (school_id);

create index if not exists school_referee_scores_by_sport_sport_idx
  on public.school_referee_scores_by_sport (sport);
