-- Pryrox does NOT use a dedicated "roles" table. Application access is modeled as:
--   1) public.user_role ENUM — allowed tenant role values (migration 20240322000001).
--   2) public.pharmacy_users.role — which role a user has at which pharmacy (tenant RBAC).
--   3) public.users.is_platform_admin — Pryrox platform operator (no pharmacy_users row).
-- auth.users.role is Supabase Auth only (e.g. 'authenticated'); it is NOT the app pharmacy role.

COMMENT ON TYPE public.user_role IS
  'Tenant / legacy platform-staff role labels. Used by public.pharmacy_users.role. '
  'Values: admin (legacy synthetic-tenant platform row), pharmacy_owner, pharmacist, cashier, staff. '
  'Platform staff preferred model: public.users.is_platform_admin instead of pharmacy_users.admin.';

COMMENT ON COLUMN public.pharmacy_users.role IS
  'Per-pharmacy membership role (type public.user_role). One row per (pharmacy_id, user_id).';

COMMENT ON COLUMN public.users.is_platform_admin IS
  'When true, user is Pryrox platform staff (superadmin UI); independent of pharmacy_users.';
