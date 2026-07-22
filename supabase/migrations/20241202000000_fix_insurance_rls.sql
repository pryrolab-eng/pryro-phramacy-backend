-- Fix insurance_providers RLS policies for superadmin

-- Drop conflicting policies
DROP POLICY IF EXISTS "Pharmacy staff can view insurance providers" ON insurance_providers;
DROP POLICY IF EXISTS "Pharmacy staff can manage insurance providers" ON insurance_providers;
DROP POLICY IF EXISTS "Anyone can view active insurance providers" ON insurance_providers;
DROP POLICY IF EXISTS "Superadmin can manage insurance providers" ON insurance_providers;

-- Allow viewing active insurance providers
CREATE POLICY "view_active_insurance_providers" ON insurance_providers
    FOR SELECT USING (
        is_active = true 
        OR pharmacy_id = ANY(get_user_pharmacy_ids())
        OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND email = 'abdousentore@gmail.com')
    );

-- Allow superadmin full access
CREATE POLICY "superadmin_manage_insurance" ON insurance_providers
    FOR ALL USING (
        EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND email = 'abdousentore@gmail.com')
    );

-- Allow pharmacy staff to manage their pharmacy's insurance providers
CREATE POLICY "pharmacy_manage_insurance" ON insurance_providers
    FOR ALL USING (
        pharmacy_id = ANY(get_user_pharmacy_ids())
    );
