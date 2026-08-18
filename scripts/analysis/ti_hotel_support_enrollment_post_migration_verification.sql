-- Read-only verification for 20260817_ti_hotel_support_director_enrollment.sql.
-- Run only after the founder has manually applied the migration.

select
  to_regclass('public.ti_hotel_support_invitations') as invitations,
  to_regclass('public.ti_hotel_support_acceptances') as acceptances,
  to_regclass('public.ti_hotel_support_enrollment_reviews') as reviews,
  to_regclass('public.ti_hotel_support_enrollment_audit') as audit;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'ti_hotel_support_invitations_one_active_per_tournament_idx',
    'ti_hotel_support_acceptances_tournament_rate_idx'
  )
order by indexname;

select event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in (
    'ti_hotel_support_acceptances_immutable_v1',
    'ti_hotel_support_enrollment_audit_immutable_v1',
    'ti_hotel_support_enrollment_reviews_transition_v1',
    'ti_tournament_hotel_program_enrollment_guard_v1'
  )
order by event_object_table, trigger_name, event_manipulation;

select
  table_name,
  has_table_privilege('anon', format('public.%I', table_name), 'SELECT') as anon_select,
  has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT') as authenticated_select,
  has_table_privilege('service_role', format('public.%I', table_name), 'SELECT') as service_role_select
from information_schema.tables
where table_schema = 'public'
  and table_name like 'ti_hotel_support_%'
order by table_name;

select
  count(*) as invitation_rows,
  count(*) filter (where state = 'active') as active_invitation_rows
from public.ti_hotel_support_invitations;

select count(*) as acceptance_rows from public.ti_hotel_support_acceptances;
select count(*) as review_rows from public.ti_hotel_support_enrollment_reviews;
select count(*) as audit_rows from public.ti_hotel_support_enrollment_audit;

-- Terms v2 / three-checkbox evidence migration checks.
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'ti_hotel_support_acceptances'
  and column_name in (
    'confirmation_version',
    'confirm_authority',
    'confirm_housing_eligibility',
    'confirm_no_guarantee',
    'confirm_eligible_attribution',
    'confirm_terms'
  )
order by ordinal_position;

select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.ti_hotel_support_acceptances'::regclass
  and conname in (
    'ti_hotel_support_acceptances_recipient_type_check',
    'ti_hotel_support_acceptances_confirmations_check',
    'ti_hotel_support_acceptances_terms_confirmation_version_check'
  )
order by conname;

select
  to_regprocedure(
    'public.submit_ti_hotel_support_enrollment_v2(text,text,text,text,text,text,text,boolean,boolean,boolean)'
  ) as v2_submission_function,
  has_function_privilege(
    'anon',
    'public.submit_ti_hotel_support_enrollment_v2(text,text,text,text,text,text,text,boolean,boolean,boolean)',
    'EXECUTE'
  ) as anon_execute,
  has_function_privilege(
    'authenticated',
    'public.submit_ti_hotel_support_enrollment_v2(text,text,text,text,text,text,text,boolean,boolean,boolean)',
    'EXECUTE'
  ) as authenticated_execute,
  has_function_privilege(
    'service_role',
    'public.submit_ti_hotel_support_enrollment_v2(text,text,text,text,text,text,text,boolean,boolean,boolean)',
    'EXECUTE'
  ) as service_role_execute;

select terms_version, count(*) as acceptance_rows
from public.ti_hotel_support_acceptances
group by terms_version
order by terms_version;

select confirmation_version, count(*) as acceptance_rows
from public.ti_hotel_support_acceptances
group by confirmation_version
order by confirmation_version;

select count(*) as individual_recipient_rows
from public.ti_hotel_support_acceptances
where expected_recipient_type = 'individual';

select
  count(*) filter (
    where confirmation_version = 'three_checkbox_v2'
      and confirm_authority is true
      and confirm_housing_eligibility is true
      and confirm_no_guarantee is null
      and confirm_eligible_attribution is null
      and confirm_terms is true
  ) as valid_three_checkbox_v2_rows,
  count(*) filter (where confirmation_version = 'three_checkbox_v2') as total_three_checkbox_v2_rows
from public.ti_hotel_support_acceptances;
