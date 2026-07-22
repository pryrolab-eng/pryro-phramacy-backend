-- =============================================================================
-- Pryrox — local development seed (auth users + pharmacy memberships)
-- =============================================================================
-- Runs automatically after `npx supabase db reset --local` (see config.toml).
--
-- There is NO "roles" table. Tenant roles are enum public.user_role on
-- public.pharmacy_users.role; platform staff use public.users.is_platform_admin.
-- (auth.users.role is only Supabase Auth, e.g. authenticated — not app RBAC.)
--
-- Shared password for every account:  seedpass123
--
-- Accounts (sign in at http://localhost:3000/sign-in):
--   Email                         App role / sidebar        Platform / tenant
--   ----------------------------- ------------------------- -------------------------
--   abdousentore@gmail.com        Platform superadmin       public.users.is_platform_admin (no pharmacy)
--   pharmacy@test.com             Pharmacy owner            pharmacy_owner
--   pharmacist@test.com           Pharmacist                pharmacist
--   cashier@test.com              Cashier                   cashier
--   staff@seed.pryrox             Staff (limited)           staff
--
-- Tenant users are attached to pharmacy 11111111-1111-1111-1111-111111111111
-- ("City Pharmacy Kigali" from sample migrations).
--
-- SECURITY: These credentials are for local Docker only. Never use this file
-- against production. Change passwords before exposing a database publicly.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Auth users (GoTrue) — bcrypt via pgcrypto
--
-- Local GoTrue (v2.x) expects:
--   - instance_id = all-zero UUID (not NULL), or password grant returns invalid_credentials
--   - confirmation_token, recovery_token, etc. as '' (not NULL), or token endpoint 500s:
--     "Scan error ... confirmation_token: converting NULL to string is unsupported"
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  phone_change,
  phone_change_token,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
)
SELECT
  'a0000001-0001-4001-8001-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'abdousentore@gmail.com',
  extensions.crypt('seedpass123', extensions.gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  false,
  false
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'abdousentore@gmail.com');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
)
SELECT
  'a0000001-0001-4001-8001-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'pharmacy@test.com',
  extensions.crypt('seedpass123', extensions.gen_salt('bf')),
  now(),
  '', '', '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  false,
  false
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'pharmacy@test.com');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
)
SELECT
  'a0000001-0001-4001-8001-000000000003'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'pharmacist@test.com',
  extensions.crypt('seedpass123', extensions.gen_salt('bf')),
  now(),
  '', '', '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  false,
  false
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'pharmacist@test.com');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
)
SELECT
  'a0000001-0001-4001-8001-000000000004'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'cashier@test.com',
  extensions.crypt('seedpass123', extensions.gen_salt('bf')),
  now(),
  '', '', '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  false,
  false
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'cashier@test.com');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
)
SELECT
  'a0000001-0001-4001-8001-000000000005'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'staff@seed.pryrox',
  extensions.crypt('seedpass123', extensions.gen_salt('bf')),
  now(),
  '', '', '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  false,
  false
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'staff@seed.pryrox');

-- ---------------------------------------------------------------------------
-- 2) Email identities (required for signInWithPassword in Supabase 2.x)
-- ---------------------------------------------------------------------------
INSERT INTO auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
SELECT
  u.id,
  u.id::text,
  'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  now(),
  now(),
  now()
FROM auth.users u
WHERE u.email IN (
  'abdousentore@gmail.com',
  'pharmacy@test.com',
  'pharmacist@test.com',
  'cashier@test.com',
  'staff@seed.pryrox'
)
AND NOT EXISTS (
  SELECT 1 FROM auth.identities i
  WHERE i.user_id = u.id AND i.provider = 'email'
);

-- ---------------------------------------------------------------------------
-- 3) Staff role — not covered by setup_all_users() trigger
--     Platform seed email gets is_platform_admin via setup_all_users (migration 20250614+).
-- ---------------------------------------------------------------------------
INSERT INTO public.pharmacy_users (pharmacy_id, user_id, role, is_active)
SELECT
  '11111111-1111-1111-1111-111111111111'::uuid,
  u.id,
  'staff'::public.user_role,
  true
FROM auth.users u
WHERE u.email = 'staff@seed.pryrox'
ON CONFLICT (pharmacy_id, user_id) DO UPDATE
SET role = EXCLUDED.role,
    is_active = EXCLUDED.is_active;

-- Ensure platform profile flag (trigger also sets this after public.users exists).
UPDATE public.users
SET is_platform_admin = true
WHERE id IN (SELECT id FROM auth.users WHERE email = 'abdousentore@gmail.com');

COMMIT;
