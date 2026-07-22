-- Platform feature catalog + plan feature matrix for SaaS entitlements

CREATE TABLE IF NOT EXISTS public.platform_features (
  key text PRIMARY KEY,
  display_name text NOT NULL,
  description text,
  "group" text NOT NULL DEFAULT 'General',
  feature_type text NOT NULL DEFAULT 'boolean'
    CHECK (feature_type IN ('boolean', 'limit', 'metered')),
  limit_column text,
  nav_routes text[] NOT NULL DEFAULT '{}',
  api_routes jsonb,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_features (
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.platform_features(key) ON DELETE CASCADE,
  feature_label text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_plan_features_plan_id ON public.plan_features(plan_id);
CREATE INDEX IF NOT EXISTS idx_platform_features_group ON public.platform_features("group", sort_order);

-- Align pre-existing plan_features (table may exist without enabled / created_at)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'plan_features'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'plan_features'
        AND column_name = 'enabled'
    ) THEN
      ALTER TABLE public.plan_features
        ADD COLUMN enabled boolean NOT NULL DEFAULT true;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'plan_features'
        AND column_name = 'created_at'
    ) THEN
      ALTER TABLE public.plan_features
        ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'plan_features'
        AND column_name = 'feature_label'
    ) THEN
      ALTER TABLE public.plan_features ADD COLUMN feature_label text;
    END IF;
  END IF;
END $$;

-- Seed catalog (boolean + limit metadata)
INSERT INTO public.platform_features (key, display_name, description, "group", feature_type, limit_column, nav_routes, sort_order) VALUES
  ('app.dashboard', 'Dashboard', 'Pharmacy and pharmacist dashboards', 'Core', 'boolean', NULL, ARRAY['/pharmacy-dashboard', '/pharmacist-dashboard', '/dashboard'], 10),
  ('pos.access', 'POS access', 'Point of sale', 'POS', 'boolean', NULL, ARRAY['/pos'], 20),
  ('pos.hold', 'Hold sales', 'Hold and resume sales', 'POS', 'boolean', NULL, '{}', 21),
  ('pos.void', 'Void sales', 'Void completed sales', 'POS', 'boolean', NULL, '{}', 22),
  ('pos.returns', 'Returns', 'Process returns', 'POS', 'boolean', NULL, '{}', 23),
  ('pos.insurance', 'Insurance at POS', 'Insurance lookup and billing at POS', 'POS', 'boolean', NULL, '{}', 24),
  ('inventory.access', 'Inventory', 'Manage inventory', 'Inventory', 'boolean', NULL, ARRAY['/inventory'], 30),
  ('inventory.analytics', 'Inventory analytics', 'Inventory charts and analytics', 'Inventory', 'boolean', NULL, '{}', 31),
  ('customers.access', 'Customers', 'Customer records', 'CRM', 'boolean', NULL, ARRAY['/customers'], 40),
  ('patients.access', 'Patients', 'Patient records', 'CRM', 'boolean', NULL, ARRAY['/patients'], 41),
  ('prescriptions.access', 'Prescriptions', 'Prescription workflow', 'CRM', 'boolean', NULL, ARRAY['/prescriptions'], 42),
  ('sales.view', 'Sales', 'Sales history and analytics', 'Sales', 'boolean', NULL, ARRAY['/sales'], 50),
  ('reports.view', 'Reports', 'Business reports', 'Reports', 'boolean', NULL, ARRAY['/reports'], 60),
  ('branches.access', 'Branches', 'View branches', 'Branches', 'boolean', NULL, ARRAY['/branches'], 70),
  ('branches.create', 'Create branches', 'Add new branches', 'Branches', 'boolean', NULL, '{}', 71),
  ('staff.access', 'Staff', 'View staff', 'Staff', 'boolean', NULL, ARRAY['/staff'], 80),
  ('staff.invite', 'Invite staff', 'Invite pharmacists and staff', 'Staff', 'boolean', NULL, '{}', 81),
  ('settings.access', 'Settings', 'Pharmacy settings', 'Settings', 'boolean', NULL, ARRAY['/settings'], 90),
  ('billing.self_serve', 'Billing', 'Subscription and billing', 'Billing', 'boolean', NULL, ARRAY['/pharmacy-dashboard/billing'], 100),
  ('limit.users', 'User limit', 'Maximum active users', 'Limits', 'limit', 'max_users', '{}', 200),
  ('limit.branches', 'Branch slots', 'Maximum branches included in plan', 'Limits', 'limit', 'max_branches', '{}', 201),
  ('limit.transactions_per_branch', 'Transactions per branch', 'Monthly POS transactions per branch', 'Limits', 'metered', 'monthly_tx_limit', '{}', 202)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  "group" = EXCLUDED."group",
  feature_type = EXCLUDED.feature_type,
  limit_column = EXCLUDED.limit_column,
  nav_routes = EXCLUDED.nav_routes,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Repair legacy plan_features rows missing feature_label
UPDATE public.plan_features pf
SET feature_label = cat.display_name
FROM public.platform_features cat
WHERE pf.feature_key = cat.key
  AND (pf.feature_label IS NULL OR pf.feature_label = '');

-- Backfill plan_features (legacy DB may require feature_label NOT NULL)
DO $$
DECLARE
  has_label boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'plan_features'
      AND column_name = 'feature_label'
  ) INTO has_label;

  IF has_label THEN
    INSERT INTO public.plan_features (plan_id, feature_key, enabled, feature_label)
    SELECT sp.id, f.key, true, cat.display_name
    FROM public.subscription_plans sp
    CROSS JOIN (
      SELECT unnest(ARRAY[
        'app.dashboard','pos.access','inventory.access','customers.access',
        'settings.access','billing.self_serve','limit.users','limit.branches','limit.transactions_per_branch'
      ]) AS key
    ) f
    JOIN public.platform_features cat ON cat.key = f.key
    WHERE lower(sp.name) IN ('free', 'starter')
      AND coalesce(sp.plan_type, 'main') = 'main'
    ON CONFLICT DO NOTHING;

    INSERT INTO public.plan_features (plan_id, feature_key, enabled, feature_label)
    SELECT sp.id, f.key, true, cat.display_name
    FROM public.subscription_plans sp
    CROSS JOIN (
      SELECT unnest(ARRAY[
        'app.dashboard','pos.access','pos.hold','pos.void','pos.returns','pos.insurance',
        'inventory.access','inventory.analytics','customers.access','patients.access',
        'prescriptions.access','sales.view','reports.view','branches.access','branches.create',
        'staff.access','staff.invite','settings.access','billing.self_serve',
        'limit.users','limit.branches','limit.transactions_per_branch'
      ]) AS key
    ) f
    JOIN public.platform_features cat ON cat.key = f.key
    WHERE lower(sp.name) IN ('standard', 'pro', 'professional')
      AND coalesce(sp.plan_type, 'main') = 'main'
    ON CONFLICT DO NOTHING;

    INSERT INTO public.plan_features (plan_id, feature_key, enabled, feature_label)
    SELECT sp.id, f.key, true, cat.display_name
    FROM public.subscription_plans sp
    CROSS JOIN (
      SELECT unnest(ARRAY[
        'app.dashboard','pos.access','pos.hold','pos.void','pos.returns','pos.insurance',
        'inventory.access','inventory.analytics','customers.access','patients.access',
        'prescriptions.access','sales.view','reports.view','branches.access','branches.create',
        'staff.access','staff.invite','settings.access','billing.self_serve',
        'limit.users','limit.branches','limit.transactions_per_branch'
      ]) AS key
    ) f
    JOIN public.platform_features cat ON cat.key = f.key
    WHERE lower(sp.name) IN ('premium', 'enterprise')
      AND coalesce(sp.plan_type, 'main') = 'main'
    ON CONFLICT DO NOTHING;

    INSERT INTO public.plan_features (plan_id, feature_key, enabled, feature_label)
    SELECT sp.id, f.key, true, cat.display_name
    FROM public.subscription_plans sp
    CROSS JOIN (
      SELECT unnest(ARRAY[
        'app.dashboard','pos.access','inventory.access','customers.access',
        'sales.view','settings.access','billing.self_serve',
        'limit.users','limit.branches','limit.transactions_per_branch'
      ]) AS key
    ) f
    JOIN public.platform_features cat ON cat.key = f.key
    WHERE coalesce(sp.plan_type, 'main') = 'main'
      AND sp.is_active = true
      AND NOT EXISTS (SELECT 1 FROM public.plan_features pf WHERE pf.plan_id = sp.id)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.plan_features (plan_id, feature_key, enabled)
    SELECT sp.id, f.key, true
    FROM public.subscription_plans sp
    CROSS JOIN (
      SELECT unnest(ARRAY[
        'app.dashboard','pos.access','inventory.access','customers.access',
        'settings.access','billing.self_serve','limit.users','limit.branches','limit.transactions_per_branch'
      ]) AS key
    ) f
    WHERE lower(sp.name) IN ('free', 'starter')
      AND coalesce(sp.plan_type, 'main') = 'main'
    ON CONFLICT DO NOTHING;

    INSERT INTO public.plan_features (plan_id, feature_key, enabled)
    SELECT sp.id, f.key, true
    FROM public.subscription_plans sp
    CROSS JOIN (
      SELECT unnest(ARRAY[
        'app.dashboard','pos.access','pos.hold','pos.void','pos.returns','pos.insurance',
        'inventory.access','inventory.analytics','customers.access','patients.access',
        'prescriptions.access','sales.view','reports.view','branches.access','branches.create',
        'staff.access','staff.invite','settings.access','billing.self_serve',
        'limit.users','limit.branches','limit.transactions_per_branch'
      ]) AS key
    ) f
    WHERE lower(sp.name) IN ('standard', 'pro', 'professional')
      AND coalesce(sp.plan_type, 'main') = 'main'
    ON CONFLICT DO NOTHING;

    INSERT INTO public.plan_features (plan_id, feature_key, enabled)
    SELECT sp.id, f.key, true
    FROM public.subscription_plans sp
    CROSS JOIN (
      SELECT unnest(ARRAY[
        'app.dashboard','pos.access','pos.hold','pos.void','pos.returns','pos.insurance',
        'inventory.access','inventory.analytics','customers.access','patients.access',
        'prescriptions.access','sales.view','reports.view','branches.access','branches.create',
        'staff.access','staff.invite','settings.access','billing.self_serve',
        'limit.users','limit.branches','limit.transactions_per_branch'
      ]) AS key
    ) f
    WHERE lower(sp.name) IN ('premium', 'enterprise')
      AND coalesce(sp.plan_type, 'main') = 'main'
    ON CONFLICT DO NOTHING;

    INSERT INTO public.plan_features (plan_id, feature_key, enabled)
    SELECT sp.id, f.key, true
    FROM public.subscription_plans sp
    CROSS JOIN (
      SELECT unnest(ARRAY[
        'app.dashboard','pos.access','inventory.access','customers.access',
        'sales.view','settings.access','billing.self_serve',
        'limit.users','limit.branches','limit.transactions_per_branch'
      ]) AS key
    ) f
    WHERE coalesce(sp.plan_type, 'main') = 'main'
      AND sp.is_active = true
      AND NOT EXISTS (SELECT 1 FROM public.plan_features pf WHERE pf.plan_id = sp.id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- RLS: platform admins via service role; read for authenticated (plan editor uses service client)
ALTER TABLE public.platform_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_features_read_authenticated" ON public.platform_features;
CREATE POLICY "platform_features_read_authenticated"
  ON public.platform_features FOR SELECT
  TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "plan_features_read_authenticated" ON public.plan_features;
CREATE POLICY "plan_features_read_authenticated"
  ON public.plan_features FOR SELECT
  TO authenticated
  USING (true);
