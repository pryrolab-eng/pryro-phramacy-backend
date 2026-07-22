-- ============================================================
-- CLEAN SAAS SUBSCRIPTION SYSTEM
-- Model: pharmacy owner → organization → branches
--        owner buys plan (defines branch limit + tx limit)
--        each branch tracked independently
--        multiple subscriptions → combined monthly invoice
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. BRANCHES TABLE (must exist before subscriptions FK)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.branches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id  uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  name         text NOT NULL,
  address      text,
  phone        text,
  email        text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamp with time zone DEFAULT now(),
  updated_at   timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branches_pharmacy_id ON public.branches(pharmacy_id);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='branches' AND policyname='branches_select_own') THEN
    CREATE POLICY "branches_select_own" ON public.branches FOR SELECT
      USING (pharmacy_id IN (
        SELECT pharmacy_id FROM public.pharmacy_users
        WHERE user_id = auth.uid() AND is_active = true
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='branches' AND policyname='branches_owner_manage') THEN
    CREATE POLICY "branches_owner_manage" ON public.branches FOR ALL
      USING (pharmacy_id IN (
        SELECT pharmacy_id FROM public.pharmacy_users
        WHERE user_id = auth.uid()
          AND role IN ('pharmacy_owner', 'admin')
          AND is_active = true
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='branches' AND policyname='branches_admin_all') THEN
    CREATE POLICY "branches_admin_all" ON public.branches FOR ALL
      USING (public.is_superadmin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_branches_updated_at'
      AND event_object_table = 'branches'
  ) THEN
    CREATE TRIGGER update_branches_updated_at
      BEFORE UPDATE ON public.branches
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. EXTEND subscription_plans with SaaS limits
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS max_branches     integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_users        integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS monthly_tx_limit integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS plan_type        text    NOT NULL DEFAULT 'main'
    CHECK (plan_type IN ('main', 'branch_addon')),
  ADD COLUMN IF NOT EXISTS billing_period   text    NOT NULL DEFAULT 'monthly'
    CHECK (billing_period IN ('monthly', 'yearly', 'free'));

COMMENT ON COLUMN public.subscription_plans.max_branches     IS 'How many branches this plan allows (for main plans)';
COMMENT ON COLUMN public.subscription_plans.max_users        IS 'Max staff users across all branches';
COMMENT ON COLUMN public.subscription_plans.monthly_tx_limit IS 'Max sales transactions per branch per billing cycle';
COMMENT ON COLUMN public.subscription_plans.plan_type        IS 'main = org-level plan; branch_addon = extra branch subscription';
COMMENT ON COLUMN public.subscription_plans.billing_period   IS 'monthly | yearly | free';

-- ────────────────────────────────────────────────────────────
-- 3. EXTEND subscriptions for multi-subscription model
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS branch_id            uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subscription_type    text NOT NULL DEFAULT 'main'
    CHECK (subscription_type IN ('main', 'branch_addon')),
  ADD COLUMN IF NOT EXISTS status               text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('active', 'pending', 'cancelled', 'expired', 'past_due')),
  ADD COLUMN IF NOT EXISTS current_period_start timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS current_period_end   timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cancelled_at         timestamp with time zone,
  ADD COLUMN IF NOT EXISTS trial_ends_at        timestamp with time zone;

COMMENT ON COLUMN public.subscriptions.branch_id         IS 'Set for branch_addon subscriptions; NULL for main plan';
COMMENT ON COLUMN public.subscriptions.subscription_type IS 'main = org plan; branch_addon = extra branch';
COMMENT ON COLUMN public.subscriptions.status            IS 'active | pending | cancelled | expired | past_due';

-- RLS on subscriptions (all wrapped in IF NOT EXISTS)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='subscriptions_select_own') THEN
    CREATE POLICY "subscriptions_select_own" ON public.subscriptions FOR SELECT
      USING (pharmacy_id IN (
        SELECT pharmacy_id FROM public.pharmacy_users
        WHERE user_id = auth.uid() AND is_active = true
      ));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. BRANCH USAGE TRACKING
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.branch_usage (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id           uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  pharmacy_id         uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  subscription_id     uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  billing_cycle_start date NOT NULL,
  billing_cycle_end   date NOT NULL,
  tx_count            integer NOT NULL DEFAULT 0,
  tx_limit            integer NOT NULL DEFAULT 500,
  is_blocked          boolean NOT NULL DEFAULT false,
  reset_at            timestamp with time zone,
  created_at          timestamp with time zone DEFAULT now(),
  updated_at          timestamp with time zone DEFAULT now(),
  UNIQUE (branch_id, billing_cycle_start)
);

CREATE INDEX IF NOT EXISTS idx_branch_usage_branch_id   ON public.branch_usage(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_usage_pharmacy_id ON public.branch_usage(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_branch_usage_cycle       ON public.branch_usage(billing_cycle_start, billing_cycle_end);
CREATE INDEX IF NOT EXISTS idx_branch_usage_blocked     ON public.branch_usage(is_blocked) WHERE is_blocked = true;

ALTER TABLE public.branch_usage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='branch_usage' AND policyname='branch_usage_select_own') THEN
    CREATE POLICY "branch_usage_select_own" ON public.branch_usage FOR SELECT
      USING (pharmacy_id IN (
        SELECT pharmacy_id FROM public.pharmacy_users
        WHERE user_id = auth.uid() AND is_active = true
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='branch_usage' AND policyname='branch_usage_admin_all') THEN
    CREATE POLICY "branch_usage_admin_all" ON public.branch_usage FOR ALL
      USING (public.is_superadmin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_branch_usage_updated_at'
      AND event_object_table = 'branch_usage'
  ) THEN
    CREATE TRIGGER update_branch_usage_updated_at
      BEFORE UPDATE ON public.branch_usage
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5. SUBSCRIPTION INVOICES (combined monthly bill)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id    uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  invoice_number text UNIQUE NOT NULL,
  billing_month  text NOT NULL,
  subtotal       numeric(12,2) NOT NULL DEFAULT 0,
  total          numeric(12,2) NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'overdue', 'void')),
  due_date       date NOT NULL,
  paid_at        timestamp with time zone,
  notes          text,
  created_at     timestamp with time zone DEFAULT now(),
  updated_at     timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscription_invoice_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid NOT NULL REFERENCES public.subscription_invoices(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  branch_id       uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  description     text NOT NULL,
  amount          numeric(12,2) NOT NULL DEFAULT 0,
  created_at      timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_invoices_pharmacy  ON public.subscription_invoices(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_sub_invoices_month     ON public.subscription_invoices(billing_month);
CREATE INDEX IF NOT EXISTS idx_sub_invoices_status    ON public.subscription_invoices(status);
CREATE INDEX IF NOT EXISTS idx_sub_invoice_lines_inv  ON public.subscription_invoice_lines(invoice_id);

ALTER TABLE public.subscription_invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_invoice_lines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscription_invoices' AND policyname='sub_invoices_select_own') THEN
    CREATE POLICY "sub_invoices_select_own" ON public.subscription_invoices FOR SELECT
      USING (pharmacy_id IN (
        SELECT pharmacy_id FROM public.pharmacy_users
        WHERE user_id = auth.uid() AND is_active = true
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscription_invoices' AND policyname='sub_invoices_admin_all') THEN
    CREATE POLICY "sub_invoices_admin_all" ON public.subscription_invoices FOR ALL
      USING (public.is_superadmin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscription_invoice_lines' AND policyname='sub_invoice_lines_select_own') THEN
    CREATE POLICY "sub_invoice_lines_select_own" ON public.subscription_invoice_lines FOR SELECT
      USING (invoice_id IN (
        SELECT id FROM public.subscription_invoices
        WHERE pharmacy_id IN (
          SELECT pharmacy_id FROM public.pharmacy_users
          WHERE user_id = auth.uid() AND is_active = true
        )
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscription_invoice_lines' AND policyname='sub_invoice_lines_admin_all') THEN
    CREATE POLICY "sub_invoice_lines_admin_all" ON public.subscription_invoice_lines FOR ALL
      USING (public.is_superadmin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_sub_invoices_updated_at'
      AND event_object_table = 'subscription_invoices'
  ) THEN
    CREATE TRIGGER update_sub_invoices_updated_at
      BEFORE UPDATE ON public.subscription_invoices
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 6. CORE FUNCTIONS
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_pharmacy_main_subscription(p_pharmacy_id uuid)
RETURNS TABLE (
  subscription_id    uuid,
  plan_id            uuid,
  plan_name          text,
  max_branches       integer,
  max_users          integer,
  monthly_tx_limit   integer,
  status             text,
  current_period_end timestamp with time zone
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.plan_id,
    sp.name,
    sp.max_branches,
    sp.max_users,
    sp.monthly_tx_limit,
    s.status,
    s.current_period_end
  FROM public.subscriptions s
  JOIN public.subscription_plans sp ON sp.id = s.plan_id
  WHERE s.pharmacy_id = p_pharmacy_id
    AND s.subscription_type = 'main'
    AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.count_active_branches(p_pharmacy_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.branches
  WHERE pharmacy_id = p_pharmacy_id AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.check_branch_can_transact(p_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage public.branch_usage%ROWTYPE;
  v_today date := CURRENT_DATE;
BEGIN
  SELECT * INTO v_usage
  FROM public.branch_usage
  WHERE branch_id = p_branch_id
    AND billing_cycle_start <= v_today
    AND billing_cycle_end   >= v_today
  ORDER BY billing_cycle_start DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason',  'no_subscription',
      'message', 'This branch has no active subscription.'
    );
  END IF;

  IF v_usage.is_blocked THEN
    RETURN jsonb_build_object(
      'allowed',   false,
      'reason',    'limit_reached',
      'tx_count',  v_usage.tx_count,
      'tx_limit',  v_usage.tx_limit,
      'message',   'Transaction limit reached. Upgrade plan or add subscription.'
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed',   true,
    'tx_count',  v_usage.tx_count,
    'tx_limit',  v_usage.tx_limit,
    'remaining', v_usage.tx_limit - v_usage.tx_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_branch_tx(p_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage     public.branch_usage%ROWTYPE;
  v_today     date := CURRENT_DATE;
  v_new_count integer;
  v_blocked   boolean;
BEGIN
  SELECT * INTO v_usage
  FROM public.branch_usage
  WHERE branch_id = p_branch_id
    AND billing_cycle_start <= v_today
    AND billing_cycle_end   >= v_today
  ORDER BY billing_cycle_start DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_usage_record');
  END IF;

  v_new_count := v_usage.tx_count + 1;
  v_blocked   := v_new_count >= v_usage.tx_limit;

  UPDATE public.branch_usage
  SET tx_count   = v_new_count,
      is_blocked = v_blocked,
      updated_at = now()
  WHERE id = v_usage.id;

  RETURN jsonb_build_object(
    'ok',        true,
    'tx_count',  v_new_count,
    'tx_limit',  v_usage.tx_limit,
    'remaining', v_usage.tx_limit - v_new_count,
    'blocked',   v_blocked
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_branch_usage(
  p_branch_id       uuid,
  p_pharmacy_id     uuid,
  p_subscription_id uuid,
  p_tx_limit        integer,
  p_period_start    date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_end date;
  v_id         uuid;
BEGIN
  v_period_end := (date_trunc('month', p_period_start) + interval '1 month - 1 day')::date;

  INSERT INTO public.branch_usage (
    branch_id, pharmacy_id, subscription_id,
    billing_cycle_start, billing_cycle_end,
    tx_count, tx_limit, is_blocked
  )
  VALUES (
    p_branch_id, p_pharmacy_id, p_subscription_id,
    date_trunc('month', p_period_start)::date, v_period_end,
    0, p_tx_limit, false
  )
  ON CONFLICT (branch_id, billing_cycle_start)
  DO UPDATE SET
    tx_limit        = EXCLUDED.tx_limit,
    subscription_id = EXCLUDED.subscription_id,
    is_blocked      = false,
    updated_at      = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_monthly_branch_usage()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_rec   RECORD;
BEGIN
  FOR v_rec IN
    SELECT bu.branch_id, bu.pharmacy_id, bu.subscription_id, bu.tx_limit
    FROM public.branch_usage bu
    WHERE bu.billing_cycle_end < CURRENT_DATE
  LOOP
    PERFORM public.provision_branch_usage(
      v_rec.branch_id,
      v_rec.pharmacy_id,
      v_rec.subscription_id,
      v_rec.tx_limit
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 7. SEED DEFAULT PLANS
-- ────────────────────────────────────────────────────────────
INSERT INTO public.subscription_plans
  (name, price, period, billing_period, plan_type, max_branches, max_users, monthly_tx_limit, features, is_popular, is_active)
VALUES
  (
    'Starter', 0, 'free', 'free', 'main', 1, 3, 200,
    ARRAY['1 Branch','Up to 3 staff','POS & Inventory','200 transactions/month','Basic reports'],
    false, true
  ),
  (
    'Standard', 50000, 'per month', 'monthly', 'main', 5, 15, 2000,
    ARRAY['Up to 5 branches','Up to 15 staff','Full POS & Inventory','2,000 transactions/branch/month','Insurance billing','Advanced reports'],
    true, true
  ),
  (
    'Premium', 120000, 'per month', 'monthly', 'main', 15, 50, 5000,
    ARRAY['Up to 15 branches','Up to 50 staff','Full POS & Inventory','5,000 transactions/branch/month','Insurance billing','Priority support','Custom integrations'],
    false, true
  ),
  (
    'Branch Add-on', 15000, 'per month', 'monthly', 'branch_addon', 1, 5, 2000,
    ARRAY['1 Extra branch','Up to 5 staff','2,000 transactions/month','Full POS & Inventory'],
    false, true
  )
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 8. REALTIME
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.branch_usage;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_invoices;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.branches;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
