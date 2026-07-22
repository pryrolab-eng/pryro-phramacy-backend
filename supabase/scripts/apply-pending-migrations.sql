-- Run in Supabase Dashboard → SQL Editor if `supabase db push` is not used.
-- Fixes: insurance RLS (auth.users permission denied) + platform_admin_reports table.

-- ─── 1) platform_admin_reports (from 20250618100000_platform_admin_reports.sql) ───
CREATE TABLE IF NOT EXISTS public.platform_admin_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  storage_bucket text NOT NULL DEFAULT 'platform-reports',
  storage_object_path text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_admin_reports_generated_at
  ON public.platform_admin_reports (generated_at DESC);

ALTER TABLE public.platform_admin_reports ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('platform-reports', 'platform-reports', false)
ON CONFLICT (id) DO NOTHING;

-- ─── 2) insurance_providers RLS (from 20250622100000_fix_insurance_rls_auth_users.sql) ───
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.is_platform_admin = true
  );
END;
$$;

DROP POLICY IF EXISTS "view_active_insurance_providers" ON public.insurance_providers;
DROP POLICY IF EXISTS "superadmin_manage_insurance" ON public.insurance_providers;
DROP POLICY IF EXISTS "pharmacy_manage_insurance" ON public.insurance_providers;
DROP POLICY IF EXISTS "Anyone can view active insurance providers" ON public.insurance_providers;
DROP POLICY IF EXISTS "Superadmin can manage insurance providers" ON public.insurance_providers;
DROP POLICY IF EXISTS "Pharmacy staff can view insurance providers" ON public.insurance_providers;
DROP POLICY IF EXISTS "Pharmacy staff can manage insurance providers" ON public.insurance_providers;

CREATE POLICY "view_active_insurance_providers" ON public.insurance_providers
  FOR SELECT
  USING (
    is_active = true
    OR pharmacy_id = ANY (public.get_user_pharmacy_ids())
    OR public.is_superadmin()
    OR public.is_admin()
  );

CREATE POLICY "superadmin_manage_insurance" ON public.insurance_providers
  FOR ALL
  USING (public.is_superadmin() OR public.is_admin());

CREATE POLICY "pharmacy_manage_insurance" ON public.insurance_providers
  FOR ALL
  USING (pharmacy_id = ANY (public.get_user_pharmacy_ids()));

GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_pharmacy_ids() TO authenticated;

-- ─── 3) cashier_shifts RLS (from 20260531140000_cashier_shifts_rls.sql) ───
ALTER TABLE public.cashier_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pharmacy staff can view cashier shifts" ON public.cashier_shifts;
DROP POLICY IF EXISTS "Pharmacy staff can open cashier shifts" ON public.cashier_shifts;
DROP POLICY IF EXISTS "Cashier can update own shift" ON public.cashier_shifts;

CREATE POLICY "Pharmacy staff can view cashier shifts" ON public.cashier_shifts
  FOR SELECT
  USING (pharmacy_id = ANY (public.get_user_pharmacy_ids()));

CREATE POLICY "Pharmacy staff can open cashier shifts" ON public.cashier_shifts
  FOR INSERT
  WITH CHECK (
    pharmacy_id = ANY (public.get_user_pharmacy_ids())
    AND cashier_id = auth.uid()
  );

CREATE POLICY "Cashier can update own shift" ON public.cashier_shifts
  FOR UPDATE
  USING (
    pharmacy_id = ANY (public.get_user_pharmacy_ids())
    AND cashier_id = auth.uid()
  )
  WITH CHECK (
    pharmacy_id = ANY (public.get_user_pharmacy_ids())
    AND cashier_id = auth.uid()
  );
