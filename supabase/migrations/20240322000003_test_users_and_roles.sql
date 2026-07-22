-- Set up role assignments for test users
-- This assumes users will be created manually in Supabase Auth Dashboard

-- Create a view for easy user role lookup
CREATE OR REPLACE VIEW user_roles_view AS
SELECT 
    u.id as user_id,
    u.email,
    u.full_name,
    p.id as pharmacy_id,
    p.name as pharmacy_name,
    pu.role,
    pu.is_active,
    CASE 
        WHEN u.email = 'superadmin@pyro.rw' THEN 'admin'
        ELSE pu.role::text
    END as effective_role
FROM users u
LEFT JOIN pharmacy_users pu ON u.id = pu.user_id
LEFT JOIN pharmacies p ON pu.pharmacy_id = p.id
ORDER BY u.email;

-- Create function to check user permissions
CREATE OR REPLACE FUNCTION check_user_permission(user_id uuid, required_role text, pharmacy_id uuid DEFAULT NULL)
RETURNS boolean AS $$
DECLARE
    user_email text;
BEGIN
    -- Get user email
    SELECT email INTO user_email FROM users WHERE id = user_id;
    
    -- Super admin has all permissions
    IF user_email = 'superadmin@pyro.rw' THEN
        RETURN true;
    END IF;
    
    -- Check pharmacy-specific role
    IF pharmacy_id IS NOT NULL THEN
        RETURN EXISTS (
            SELECT 1 FROM pharmacy_users pu
            WHERE pu.user_id = check_user_permission.user_id
            AND pu.pharmacy_id = check_user_permission.pharmacy_id
            AND pu.role::text = required_role
            AND pu.is_active = true
        );
    END IF;
    
    -- Check any pharmacy role
    RETURN EXISTS (
        SELECT 1 FROM pharmacy_users pu
        WHERE pu.user_id = check_user_permission.user_id
        AND pu.role::text = required_role
        AND pu.is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get user's pharmacies
CREATE OR REPLACE FUNCTION get_user_pharmacies(user_id uuid)
RETURNS TABLE(pharmacy_id uuid, pharmacy_name text, user_role text) AS $$
DECLARE
    user_email text;
BEGIN
    -- Get user email
    SELECT email INTO user_email FROM users WHERE id = user_id;
    
    -- Super admin sees all pharmacies
    IF user_email = 'superadmin@pyro.rw' THEN
        RETURN QUERY
        SELECT p.id, p.name, 'admin'::text
        FROM pharmacies p
        ORDER BY p.name;
    ELSE
        -- Regular users see only their assigned pharmacies
        RETURN QUERY
        SELECT p.id, p.name, pu.role::text
        FROM pharmacy_users pu
        JOIN pharmacies p ON pu.pharmacy_id = p.id
        WHERE pu.user_id = get_user_pharmacies.user_id
        AND pu.is_active = true
        ORDER BY p.name;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to assign user to pharmacy (to be called after user creation)
CREATE OR REPLACE FUNCTION assign_user_to_pharmacy(user_email text, pharmacy_name text, user_role user_role)
RETURNS boolean AS $$
DECLARE
    user_id uuid;
    pharmacy_id uuid;
BEGIN
    -- Get user ID
    SELECT id INTO user_id FROM users WHERE email = user_email;
    IF user_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Get pharmacy ID
    SELECT id INTO pharmacy_id FROM pharmacies WHERE name = pharmacy_name;
    IF pharmacy_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Insert or update pharmacy user assignment
    INSERT INTO pharmacy_users (pharmacy_id, user_id, role, is_active)
    VALUES (pharmacy_id, user_id, user_role, true)
    ON CONFLICT (pharmacy_id, user_id) 
    DO UPDATE SET role = user_role, is_active = true;
    
    -- If user is pharmacy owner, update pharmacy owner_id
    IF user_role = 'pharmacy_owner' THEN
        UPDATE pharmacies SET owner_id = user_id WHERE id = pharmacy_id;
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to setup all test user roles (call this after creating users in Auth)
CREATE OR REPLACE FUNCTION setup_test_user_roles()
RETURNS text AS $$
DECLARE
    result text := 'Setting up test user roles:' || chr(10);
BEGIN
    -- City Pharmacy Kigali assignments
    IF assign_user_to_pharmacy('owner.kigali@citypharmacy.rw', 'City Pharmacy Kigali', 'pharmacy_owner') THEN
        result := result || '✓ City Pharmacy owner assigned' || chr(10);
    END IF;
    
    IF assign_user_to_pharmacy('pharmacist1@citypharmacy.rw', 'City Pharmacy Kigali', 'pharmacist') THEN
        result := result || '✓ City Pharmacy pharmacist assigned' || chr(10);
    END IF;
    
    IF assign_user_to_pharmacy('cashier1@citypharmacy.rw', 'City Pharmacy Kigali', 'cashier') THEN
        result := result || '✓ City Pharmacy cashier 1 assigned' || chr(10);
    END IF;
    
    IF assign_user_to_pharmacy('cashier2@citypharmacy.rw', 'City Pharmacy Kigali', 'cashier') THEN
        result := result || '✓ City Pharmacy cashier 2 assigned' || chr(10);
    END IF;
    
    -- Health Plus Butare assignments
    IF assign_user_to_pharmacy('owner.butare@healthplus.rw', 'Health Plus Butare', 'pharmacy_owner') THEN
        result := result || '✓ Health Plus owner assigned' || chr(10);
    END IF;
    
    IF assign_user_to_pharmacy('pharmacist2@healthplus.rw', 'Health Plus Butare', 'pharmacist') THEN
        result := result || '✓ Health Plus pharmacist assigned' || chr(10);
    END IF;
    
    IF assign_user_to_pharmacy('cashier1@healthplus.rw', 'Health Plus Butare', 'cashier') THEN
        result := result || '✓ Health Plus cashier assigned' || chr(10);
    END IF;
    
    -- MediCare Gisenyi assignments
    IF assign_user_to_pharmacy('owner.gisenyi@medicare.rw', 'MediCare Gisenyi', 'pharmacy_owner') THEN
        result := result || '✓ MediCare owner assigned' || chr(10);
    END IF;
    
    IF assign_user_to_pharmacy('staff1@medicare.rw', 'MediCare Gisenyi', 'staff') THEN
        result := result || '✓ MediCare staff assigned' || chr(10);
    END IF;
    
    result := result || chr(10) || 'Setup complete! Users can now be assigned roles after creation in Supabase Auth.';
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;