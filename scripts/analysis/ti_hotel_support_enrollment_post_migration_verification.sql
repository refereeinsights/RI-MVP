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
