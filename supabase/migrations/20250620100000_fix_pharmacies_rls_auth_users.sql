-- Onboarding INSERT...RETURNING on pharmacies failed with:
-- permission denied for table users (policies queried auth.users directly).

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

DROP POLICY IF EXISTS "Superadmin can view all pharmacies" ON public.pharmacies;
DROP POLICY IF EXISTS "Superadmin can manage all pharmacies" ON public.pharmacies;

CREATE POLICY "Superadmin can view all pharmacies" ON public.pharmacies
  FOR SELECT USING (
    id = ANY(get_user_pharmacy_ids())
    OR owner_id = auth.uid()
    OR public.is_admin()
    OR public.is_superadmin()
  );

CREATE POLICY "Superadmin can manage all pharmacies" ON public.pharmacies
  FOR ALL USING (
    owner_id = auth.uid()
    OR public.is_admin()
    OR public.is_superadmin()
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_pharmacy_ids() TO authenticated;
