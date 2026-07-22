-- insurance_providers policies referenced auth.users directly, causing:
-- permission denied for table users (42501) for authenticated role.

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
