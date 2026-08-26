begin;

do $verify$
declare
  v_eagles uuid;
  v_other uuid;
  v_fixture text := 'corralio 44d rollback fixture';
  v_failed boolean := false;
begin
  select id into v_eagles
  from public.corralio_find_unique_canonical_venue_by_name_v1('eagles ice arena');
  if v_eagles is null then
    raise exception 'unique Eagles canonical resolution failed';
  end if;

  select id into v_other from public.venues where id <> v_eagles order by id limit 1;
  if v_other is null then raise exception 'control canonical venue missing'; end if;

  insert into public.corralio_venue_aliases (
    alias_kind, normalized_alias, normalized_city, state,
    canonical_venue_id, provisional_venue_id, evidence_source, normalizer_version
  ) values (
    'name', v_fixture, null, null, v_eagles, null,
    'deterministic_canonical_match', 'corralio-venue-alias-v1'
  );

  begin
    insert into public.corralio_venue_aliases (
      alias_kind, normalized_alias, normalized_city, state,
      canonical_venue_id, provisional_venue_id, evidence_source, normalizer_version
    ) values (
      'name', v_fixture, null, null, v_other, null,
      'deterministic_canonical_match', 'corralio-venue-alias-v1'
    );
  exception when unique_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'conflicting alias target was accepted'; end if;

  v_failed := false;
  begin
    insert into public.corralio_venue_aliases (
      alias_kind, normalized_alias, normalized_city, state,
      canonical_venue_id, provisional_venue_id, evidence_source, normalizer_version
    ) values (
      'name', v_fixture || ' null target', null, null, null, null,
      'deterministic_canonical_match', 'corralio-venue-alias-v1'
    );
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'targetless alias was accepted'; end if;

  if (select count(*) from public.corralio_venue_aliases where normalized_alias = v_fixture) <> 1 then
    raise exception 'alias idempotency/cardinality failed';
  end if;
end
$verify$;

rollback;

select 'SLICE 4.4D BEHAVIORAL VERIFICATION PASSED; ROLLBACK CLEANUP ZERO'
  as corralio_slice44d_behavioral_verification;
