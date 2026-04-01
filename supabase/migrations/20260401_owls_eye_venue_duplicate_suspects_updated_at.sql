-- Fix schema mismatch: `owls_eye_venue_duplicate_suspects` uses `set_updated_at()` trigger,
-- but the table was created without an `updated_at` column.
--
-- This breaks any UPDATEs (trigger tries to set NEW.updated_at).

do $$
begin
  if to_regclass('public.owls_eye_venue_duplicate_suspects') is not null then
    alter table public.owls_eye_venue_duplicate_suspects
      add column if not exists updated_at timestamptz not null default now();

    -- Maintain updated_at if the helper exists in this project.
    if exists (select 1 from pg_proc where proname = 'set_updated_at' and pg_function_is_visible(oid)) then
      drop trigger if exists trg_owls_eye_venue_duplicate_suspects_updated_at on public.owls_eye_venue_duplicate_suspects;
      create trigger trg_owls_eye_venue_duplicate_suspects_updated_at
        before update on public.owls_eye_venue_duplicate_suspects
        for each row execute function public.set_updated_at();
    else
      -- Avoid a broken trigger in environments without the helper.
      drop trigger if exists trg_owls_eye_venue_duplicate_suspects_updated_at on public.owls_eye_venue_duplicate_suspects;
    end if;
  end if;
end $$;

