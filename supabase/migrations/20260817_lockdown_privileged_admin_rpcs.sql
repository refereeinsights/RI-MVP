-- Restrict privileged admin/maintenance RPCs to server-side service-role callers.
--
-- These functions are SECURITY DEFINER and must not inherit PostgreSQL's default
-- PUBLIC execute privilege. Each function is guarded because older/local
-- environments may not contain every production RPC.

do $$
declare
  target_function regprocedure;
  target_signature text;
begin
  foreach target_signature in array array[
    'public.create_event_code(text,integer,integer,timestamp with time zone,timestamp with time zone,text,boolean)',
    'public.process_assignor_crawl_run(uuid)',
    'public.refresh_city_state_sport_venue_clusters(boolean)'
  ]
  loop
    target_function := to_regprocedure(target_signature);
    if target_function is null then
      raise notice 'Skipping absent function %', target_signature;
      continue;
    end if;

    execute format(
      'revoke all on function %s from public, anon, authenticated',
      target_function
    );
    execute format(
      'grant execute on function %s to service_role',
      target_function
    );

    if has_function_privilege('anon', target_function, 'execute') then
      raise exception 'anon retains execute on %', target_function;
    end if;
    if has_function_privilege('authenticated', target_function, 'execute') then
      raise exception 'authenticated retains execute on %', target_function;
    end if;
    if not has_function_privilege('service_role', target_function, 'execute') then
      raise exception 'service_role is missing execute on %', target_function;
    end if;
  end loop;
end
$$;
