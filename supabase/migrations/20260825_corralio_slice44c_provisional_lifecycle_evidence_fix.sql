-- Corralio Slice 4.4C repair for databases where the original migration was
-- applied before the PL/pgSQL output-variable ambiguity was found.
-- No data mutation occurs. The function body is changed only to target the
-- existing named unique constraint in both idempotent evidence inserts.

do $repair$
declare
  v_function regprocedure :=
    'public.corralio_create_or_reuse_provisional_venue_v2(uuid,uuid,text,text,text,text,text,text,double precision,double precision,text,text,text,text)'::regprocedure;
  v_definition text;
  v_old text := 'on conflict (provisional_venue_id, observation_fingerprint) do nothing';
  v_new text := 'on conflict on constraint corralio_provisional_evidence_observation_unique do nothing';
begin
  select pg_get_functiondef(v_function) into v_definition;

  if v_definition is null then
    raise exception '4.4C repair failed: V2 create/reuse function is missing';
  end if;

  if position(v_old in v_definition) > 0 then
    v_definition := replace(v_definition, v_old, v_new);
  elsif position(v_new in v_definition) = 0 then
    raise exception '4.4C repair failed: unexpected V2 create/reuse function definition';
  end if;

  execute v_definition;
end;
$repair$;

revoke all on function public.corralio_create_or_reuse_provisional_venue_v2(
  uuid, uuid, text, text, text, text, text, text,
  double precision, double precision, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.corralio_create_or_reuse_provisional_venue_v2(
  uuid, uuid, text, text, text, text, text, text,
  double precision, double precision, text, text, text, text
) to service_role;
alter function public.corralio_create_or_reuse_provisional_venue_v2(
  uuid, uuid, text, text, text, text, text, text,
  double precision, double precision, text, text, text, text
) owner to postgres;

do $verify$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.corralio_create_or_reuse_provisional_venue_v2(uuid,uuid,text,text,text,text,text,text,double precision,double precision,text,text,text,text)'::regprocedure
  ) into v_definition;

  if position('on conflict (provisional_venue_id, observation_fingerprint)' in v_definition) > 0
     or position('on conflict on constraint corralio_provisional_evidence_observation_unique do nothing' in v_definition) = 0 then
    raise exception '4.4C repair failed: ambiguous evidence conflict target remains';
  end if;
end;
$verify$;

select 'SLICE 4.4C EVIDENCE CONFLICT REPAIR PASSED' as corralio_slice44c_evidence_conflict_repair;
