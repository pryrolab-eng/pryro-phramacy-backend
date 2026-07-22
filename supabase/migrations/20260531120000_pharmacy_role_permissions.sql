-- RBAC: permissions granted per pharmacy member role (tenant team, not platform admin).

CREATE TABLE IF NOT EXISTS public.pharmacy_role_permissions (
  role text NOT NULL CHECK (role IN ('pharmacy_owner', 'pharmacist', 'cashier', 'staff')),
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission)
);

COMMENT ON TABLE public.pharmacy_role_permissions IS
  'Maps pharmacy_users.role to capability keys; used for nav and API guards.';

ALTER TABLE public.pharmacy_role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pharmacy_role_permissions_read_authenticated" ON public.pharmacy_role_permissions;
CREATE POLICY "pharmacy_role_permissions_read_authenticated"
  ON public.pharmacy_role_permissions FOR SELECT
  TO authenticated
  USING (true);

-- Owners: full tenant administration
INSERT INTO public.pharmacy_role_permissions (role, permission) VALUES
  ('pharmacy_owner', 'workspace.home'),
  ('pharmacy_owner', 'clinical.dashboard'),
  ('pharmacy_owner', 'prescriptions.access'),
  ('pharmacy_owner', 'inventory.access'),
  ('pharmacy_owner', 'pos.access'),
  ('pharmacy_owner', 'sales.view'),
  ('pharmacy_owner', 'customers.access'),
  ('pharmacy_owner', 'patients.access'),
  ('pharmacy_owner', 'reports.view'),
  ('pharmacy_owner', 'settings.self'),
  ('pharmacy_owner', 'settings.pharmacy'),
  ('pharmacy_owner', 'staff.manage'),
  ('pharmacy_owner', 'branches.manage'),
  ('pharmacy_owner', 'billing.self_serve')
ON CONFLICT (role, permission) DO NOTHING;

-- Pharmacist
INSERT INTO public.pharmacy_role_permissions (role, permission) VALUES
  ('pharmacist', 'workspace.home'),
  ('pharmacist', 'clinical.dashboard'),
  ('pharmacist', 'prescriptions.access'),
  ('pharmacist', 'inventory.access'),
  ('pharmacist', 'pos.access'),
  ('pharmacist', 'settings.self')
ON CONFLICT (role, permission) DO NOTHING;

-- Cashier
INSERT INTO public.pharmacy_role_permissions (role, permission) VALUES
  ('cashier', 'workspace.home'),
  ('cashier', 'pos.access'),
  ('cashier', 'sales.view'),
  ('cashier', 'customers.access'),
  ('cashier', 'settings.self')
ON CONFLICT (role, permission) DO NOTHING;

-- General staff
INSERT INTO public.pharmacy_role_permissions (role, permission) VALUES
  ('staff', 'workspace.home'),
  ('staff', 'pos.access'),
  ('staff', 'sales.view'),
  ('staff', 'customers.access'),
  ('staff', 'settings.self')
ON CONFLICT (role, permission) DO NOTHING;

-- Register staff workspace routes on relevant features
UPDATE public.platform_features SET nav_routes = array(
  SELECT DISTINCT unnest(COALESCE(nav_routes, ARRAY[]::text[]) || ARRAY['/pharmacy/staff-dashboard', '/pharmacy/staff-settings'])
), updated_at = now()
WHERE key IN ('app.dashboard', 'settings.access');
