-- Slice 3.6A additive repair: resolve pgcrypto through its trusted extension schema.
-- The base migration is already applied and must remain immutable.

do $prerequisite$
begin
  if to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'Slice 3.6A digest repair requires extensions.digest(text,text)';
  end if;
end
$prerequisite$;

create or replace function public.corralio_upsert_push_subscription_v1(
  p_user_id uuid,
  p_household_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_existing public.corralio_push_subscriptions%rowtype;
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted push subscription boundary is required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.corralio_household_members member
    where member.household_id = p_household_id and member.user_id = p_user_id
      and member.role = 'owner' and member.status = 'active'
  ) then raise exception 'Household access denied' using errcode = '42501'; end if;
  if length(v_endpoint) not between 1 and 4096 or v_endpoint !~ '^https://'
     or length(coalesce(p_p256dh, '')) not between 1 and 512
     or p_p256dh !~ '^[A-Za-z0-9_-]+$'
     or length(coalesce(p_auth, '')) not between 1 and 256
     or p_auth !~ '^[A-Za-z0-9_-]+$'
  then raise exception 'Push subscription is invalid' using errcode = '22023'; end if;

  select subscription.* into v_existing
  from public.corralio_push_subscriptions subscription
  where subscription.endpoint_hash = extensions.digest(v_endpoint, 'sha256')
  for update;

  if found and (v_existing.user_id <> p_user_id or v_existing.household_id <> p_household_id) then
    raise exception 'Push endpoint is already registered' using errcode = '23505';
  end if;
  if found then
    update public.corralio_push_subscriptions subscription
    set endpoint = v_endpoint, p256dh = p_p256dh, auth_secret = p_auth,
        state = 'active', deactivation_reason = null, deactivated_at = null, updated_at = now()
    where subscription.id = v_existing.id;
  else
    insert into public.corralio_push_subscriptions (
      household_id, user_id, endpoint, p256dh, auth_secret
    ) values (p_household_id, p_user_id, v_endpoint, p_p256dh, p_auth);
  end if;
  return 'subscribed';
end;
$function$;

create or replace function public.corralio_deactivate_push_subscription_v1(
  p_user_id uuid,
  p_household_id uuid,
  p_endpoint text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trusted push subscription boundary is required' using errcode = '42501';
  end if;
  update public.corralio_push_subscriptions subscription
  set state = 'revoked', deactivation_reason = 'user_unsubscribed',
      deactivated_at = now(), updated_at = now()
  where subscription.user_id = p_user_id
    and subscription.household_id = p_household_id
    and subscription.endpoint_hash = extensions.digest(btrim(coalesce(p_endpoint, '')), 'sha256')
    and subscription.state = 'active';
  return 'unsubscribed';
end;
$function$;

alter function public.corralio_upsert_push_subscription_v1(uuid,uuid,text,text,text) owner to postgres;
alter function public.corralio_deactivate_push_subscription_v1(uuid,uuid,text) owner to postgres;

revoke all on function public.corralio_upsert_push_subscription_v1(uuid,uuid,text,text,text)
  from public, anon, authenticated;
revoke all on function public.corralio_deactivate_push_subscription_v1(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.corralio_upsert_push_subscription_v1(uuid,uuid,text,text,text)
  to service_role;
grant execute on function public.corralio_deactivate_push_subscription_v1(uuid,uuid,text)
  to service_role;

select 'SLICE 3.6A DIGEST RESOLUTION REPAIR APPLIED'
  as corralio_slice36a_digest_resolution_repair;
