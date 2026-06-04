-- TI Weekend Planner (Stage 3.3C-4B): user-selectable child colors.

alter table public.planner_children
  add column if not exists color_token text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_children_color_token_valid'
  ) then
    alter table public.planner_children
      add constraint planner_children_color_token_valid
      check (
        color_token is null
        or color_token in ('forest', 'ocean', 'amber', 'violet', 'rose', 'teal')
      );
  end if;
end $$;
