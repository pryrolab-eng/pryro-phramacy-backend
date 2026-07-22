-- Backfill pharmacy_users for pharmacies that have owner_id but no membership row.
-- Run once in Supabase SQL Editor if pharmacy_users is empty after onboarding/admin bugs.

INSERT INTO public.pharmacy_users (pharmacy_id, user_id, role, is_active)
SELECT
  p.id,
  p.owner_id,
  'pharmacy_owner'::public.user_role,
  true
FROM public.pharmacies p
WHERE p.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.pharmacy_users pu
    WHERE pu.pharmacy_id = p.id
      AND pu.user_id = p.owner_id
  );
