-- user_roles_view is a reporting VIEW (not a table): it joins public.users,
-- pharmacy_users, and pharmacies so you can browse "who has which role where"
-- in Supabase Studio. App code should keep using base tables + RLS; this is optional.

CREATE OR REPLACE VIEW public.user_roles_view AS
SELECT
  u.id AS user_id,
  u.email,
  u.full_name,
  p.id AS pharmacy_id,
  p.name AS pharmacy_name,
  pu.role,
  pu.is_active,
  CASE
    WHEN u.is_platform_admin THEN 'admin'::text
    WHEN u.email = 'superadmin@pyro.rw' THEN 'admin'::text
    ELSE pu.role::text
  END AS effective_role
FROM public.users u
LEFT JOIN public.pharmacy_users pu ON u.id = pu.user_id
LEFT JOIN public.pharmacies p ON pu.pharmacy_id = p.id
ORDER BY u.email;

COMMENT ON VIEW public.user_roles_view IS
  'Read-only join of users, pharmacy_users, and pharmacies for admin/reporting. '
  'Not the source of truth for authorization (use pharmacy_users + users.is_platform_admin + RLS).';
