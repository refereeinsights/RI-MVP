-- Extend Owl's Eye nearby categories to include sporting goods + big-box fallback.
-- We store these in the existing owls_eye_nearby_food table to avoid new tables for v1.

do $$
declare
  cname text;
begin
  if to_regclass('public.owls_eye_nearby_food') is null then
    return;
  end if;

  -- Drop any existing CHECK constraints that validate the category column.
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'public.owls_eye_nearby_food'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table public.owls_eye_nearby_food drop constraint %I', cname);
  end loop;

  -- Recreate with an explicit allowlist (includes legacy values).
  execute $sql$
    alter table public.owls_eye_nearby_food
      add constraint owls_eye_nearby_food_category_allowed
      check (
        category in (
          'food',
          'coffee',
          'hotel',
          'hotels',
          'sporting_goods',
          'big_box_fallback'
        )
      )
  $sql$;
end $$;

