-- TI weekend planner activation phase 2: planner-session attribution for lodging/group requests.

do $$
begin
  if to_regclass('public.lodging_search_session') is not null then
    alter table public.lodging_search_session
      add column if not exists planner_session_id uuid,
      add column if not exists entry_source text,
      add column if not exists entry_page_type text,
      add column if not exists entry_path text,
      add column if not exists entry_placement text,
      add column if not exists current_page_type text,
      add column if not exists current_page_path text,
      add column if not exists request_source text;

    create index if not exists lodging_search_session_planner_session_id_idx
      on public.lodging_search_session (planner_session_id);

    create index if not exists lodging_search_session_entry_page_type_created_at_idx
      on public.lodging_search_session (entry_page_type, created_at desc);
  end if;
end $$;
