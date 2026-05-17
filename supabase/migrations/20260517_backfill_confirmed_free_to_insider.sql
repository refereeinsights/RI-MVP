-- Backfill: promote confirmed free/null-plan users to plan='insider'.
-- These are legacy accounts created before inserts defaulted to plan='insider'.
-- The app's getTier() already grants insider to all confirmed users; this aligns
-- the plan field with actual entitlement so admin counts and the daily email are accurate.

UPDATE public.ti_users tu
SET plan        = 'insider',
    updated_at  = now()
WHERE (tu.plan IS NULL OR tu.plan = 'free')
  AND EXISTS (
    SELECT 1
    FROM auth.users au
    WHERE au.id = tu.id
      AND au.email_confirmed_at IS NOT NULL
  );
