-- Read-only preflight for the TI Hotel Support director-enrollment migration.
-- Safe to run before applying 20260817_ti_hotel_support_director_enrollment.sql.

select
  to_regclass('public.tournaments') as tournaments_table,
  to_regclass('public.ti_tournament_hotel_programs') as phase2_hotel_program_table,
  to_regclass('public.ti_hotel_support_invitations') as invitations_before_migration,
  to_regclass('public.ti_hotel_support_acceptances') as acceptances_before_migration,
  to_regclass('public.ti_hotel_support_enrollment_reviews') as reviews_before_migration,
  to_regclass('public.ti_hotel_support_enrollment_audit') as audit_before_migration;

select
  has_table_privilege('service_role', 'public.ti_tournament_hotel_programs', 'SELECT') as service_role_can_read_phase2,
  has_table_privilege('service_role', 'public.ti_tournament_hotel_programs', 'UPDATE') as service_role_can_update_phase2;

select
  count(*) filter (where program_type = 'tournament_support' and status = 'active') as existing_active_tournament_support,
  count(*) filter (where program_type = 'tournament_support') as existing_tournament_support_total
from public.ti_tournament_hotel_programs;
