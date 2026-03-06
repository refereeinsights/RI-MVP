-- Security hardening: enable RLS, add policies, and set views to SECURITY INVOKER
-- Assumes public.is_admin() exists (service role or profiles.role='admin')

do $$
declare dummy int;
begin
  perform 1;
end $$;

-- Admin-only tables
do $$
declare tab text;
begin
  perform 1 from pg_tables where schemaname='public' and tablename='referee_contacts';
  if found then
    execute 'alter table public.referee_contacts enable row level security';
    if not exists (select 1 from pg_policies where polname='admin_all_referee_contacts') then
      execute 'create policy admin_all_referee_contacts on public.referee_contacts for all using (public.is_admin()) with check (public.is_admin())';
    end if;
  end if;

  perform 1 from pg_tables where schemaname='public' and tablename='tournament_contacts';
  if found then
    execute 'alter table public.tournament_contacts enable row level security';
    if not exists (select 1 from pg_policies where polname='admin_all_tournament_contacts') then
      execute 'create policy admin_all_tournament_contacts on public.tournament_contacts for all using (public.is_admin()) with check (public.is_admin())';
    end if;
  end if;

  perform 1 from pg_tables where schemaname='public' and tablename='tournament_referee_contacts';
  if found then
    execute 'alter table public.tournament_referee_contacts enable row level security';
    if not exists (select 1 from pg_policies where polname='admin_all_tournament_referee_contacts') then
      execute 'create policy admin_all_tournament_referee_contacts on public.tournament_referee_contacts for all using (public.is_admin()) with check (public.is_admin())';
    end if;
  end if;

  -- commerce / internal
  perform 1 from pg_tables where schemaname='public' and tablename='purchases';
  if found then
    execute 'alter table public.purchases enable row level security';
    if not exists (select 1 from pg_policies where polname='admin_all_purchases') then
      execute 'create policy admin_all_purchases on public.purchases for all using (public.is_admin()) with check (public.is_admin())';
    end if;
  end if;

  perform 1 from pg_tables where schemaname='public' and tablename='subscriptions';
  if found then
    execute 'alter table public.subscriptions enable row level security';
    if not exists (select 1 from pg_policies where polname='admin_all_subscriptions') then
      execute 'create policy admin_all_subscriptions on public.subscriptions for all using (public.is_admin()) with check (public.is_admin())';
    end if;
  end if;

  perform 1 from pg_tables where schemaname='public' and tablename='zip_centroids';
  if found then
    execute 'alter table public.zip_centroids enable row level security';
    if not exists (select 1 from pg_policies where polname='admin_all_zip_centroids') then
      execute 'create policy admin_all_zip_centroids on public.zip_centroids for all using (public.is_admin()) with check (public.is_admin())';
    end if;
  end if;

  -- Owl's Eye / Atlas / map tables (admin-only)
  for tab in select unnest(array[
    'owls_eye_runs','owls_eye_sources','owls_eye_map_artifacts','owls_eye_map_annotations','owls_eye_nearby_food',
    'atlas_sources','atlas_facts','atlas_jobs',
    'tournament_map_pages','tournament_map_page_venues'
  ])
  loop
    perform 1 from pg_tables where schemaname='public' and tablename=tab;
    if found then
      execute format('alter table public.%I enable row level security', tab);
      if not exists (select 1 from pg_policies where polname = format('admin_all_%s', tab)) then
        execute format('create policy admin_all_%1$s on public.%1$s for all using (public.is_admin()) with check (public.is_admin())', tab);
      end if;
    end if;
  end loop;
end $$;

-- Public-read / admin-write tables
do $$
declare tab text;
begin
  for tab in select unnest(array['schools','school_referee_scores','venues','tournament_listings','tournament_venues'])
  loop
    perform 1 from pg_tables where schemaname='public' and tablename=tab;
    if found then
      execute format('alter table public.%I enable row level security', tab);
      if not exists (select 1 from pg_policies where polname = format('public_select_%s', tab)) then
        execute format('create policy public_select_%1$s on public.%1$s for select using (true)', tab);
      end if;
      if not exists (select 1 from pg_policies where polname = format('admin_write_%s', tab)) then
        execute format('create policy admin_write_%1$s on public.%1$s for all using (public.is_admin()) with check (public.is_admin())', tab);
      end if;
    end if;
  end loop;
end $$;

-- Views: switch to SECURITY INVOKER (inherit caller's rights/RLS)
do $$
begin
  begin
    execute 'alter view public.tournament_referee_reviews_public set (security_invoker = true)';
  exception when others then
    null;
  end;
  begin
    execute 'alter view public.school_referee_reviews_public set (security_invoker = true)';
  exception when others then
    null;
  end;
end $$;
