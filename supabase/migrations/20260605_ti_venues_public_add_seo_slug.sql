-- TI planner venue hydration/search follow-up:
-- expose `seo_slug` on the authenticated venues_public view so planner search,
-- venue matching, and linked venue hydration can safely select it.

create or replace view public.venues_public
with (security_invoker = false) as
select
  id,
  name,
  address,
  city,
  state,
  zip,
  sport,
  seo_slug
from public.venues;

revoke all on table public.venues_public from public;
revoke all on table public.venues_public from anon;
revoke all on table public.venues_public from authenticated;

grant select on table public.venues_public to authenticated;
grant select on table public.venues_public to service_role;
