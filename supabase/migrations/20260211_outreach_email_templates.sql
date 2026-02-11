-- Outreach email templates
create table if not exists public.outreach_email_templates (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  subject_template text not null,
  body_template text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

-- updated_at trigger
 do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'set_outreach_email_templates_updated_at'
  ) then
    create trigger set_outreach_email_templates_updated_at
      before update on public.outreach_email_templates
      for each row execute function set_updated_at();
  end if;
end $$;

alter table public.outreach_email_templates enable row level security;

 do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'admin_all_outreach_email_templates') then
    create policy admin_all_outreach_email_templates
      on public.outreach_email_templates
      for all
      using (is_admin())
      with check (is_admin());
  end if;
end $$;

-- Seed templates (upsert by key)
insert into public.outreach_email_templates (key, name, subject_template, body_template, is_active)
values
  (
    'tournament_initial',
    'Tournament initial outreach',
    'Quick verification for {{tournament_name}}',
    'Hi {{first_name_or_there}},\n\nAs a tournament director, I always struggled to secure strong referees — especially for the most important games late in the weekend. As a referee, I often asked myself a different question: “Is this tournament worth my weekend?”\n\nWe built RefereeInsights to help solve both.\n\nWe’ve created a listing for {{tournament_name}}{{city_state_parens}} based on publicly available information. We’re inviting directors to verify key operational details (pay approach, check-in process, scheduling, hospitality/logistics) so referees have accurate information before committing.\n\nVerified events receive a “Tournament Staff Verified” badge indicating that operational details were confirmed by authorized staff. There’s no cost — the form takes about five minutes.\n\nWould you be open to reviewing the listing?\n\n{{tournament_url}}\n\nIf you prefer not to receive future outreach about this listing, just reply and I’ll mark this as do-not-contact.\n\nBest,\n{{sender_name}}\nRefereeInsights\n{{sender_email}}',
    true
  ),
  (
    'tournament_followup',
    'Tournament follow-up outreach',
    'Re: {{tournament_name}} verification',
    'Hi {{first_name_or_there}},\n\nJust bumping this in case it got buried. Happy to send the quick 5-minute verification form if helpful.\n\nListing:\n{{tournament_url}}\n\nIf you\'d prefer not to receive outreach about this listing, just let me know.\n\nBest,\n{{sender_name}}',
    true
  )
on conflict (key) do update
set name = excluded.name,
    subject_template = excluded.subject_template,
    body_template = excluded.body_template,
    is_active = excluded.is_active;
