-- Slice 3.6B Phase 3A repair: make a lost claim return false, never null.
-- Required only where the original Phase 3A migration was already applied.

create or replace function public.corralio_claim_current_location_route_v1(
  p_household_id uuid,
  p_event_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_claim_token uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted routing access is required' using errcode = '42501';
  end if;
  if p_household_id is null or p_event_id is null or p_claim_token is null then
    raise exception 'Routing claim context is required' using errcode = '22023';
  end if;

  insert into public.corralio_current_location_route_claims (
    household_id, event_id, claim_token, claimed_at
  ) values (
    p_household_id, p_event_id, p_claim_token, statement_timestamp()
  )
  on conflict (household_id, event_id) do update set
    claim_token = excluded.claim_token,
    claimed_at = statement_timestamp()
  where corralio_current_location_route_claims.claimed_at < statement_timestamp() - interval '2 minutes'
  returning claim_token into v_claim_token;

  return coalesce(v_claim_token = p_claim_token, false);
end;
$function$;

revoke all on function public.corralio_claim_current_location_route_v1(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.corralio_claim_current_location_route_v1(uuid, uuid, uuid)
  to service_role;
alter function public.corralio_claim_current_location_route_v1(uuid, uuid, uuid)
  owner to postgres;

select 'SLICE 3.6B PHASE 3A CLAIM RESULT REPAIR APPLIED'
  as corralio_slice36b_phase3a_claim_result_repair;
