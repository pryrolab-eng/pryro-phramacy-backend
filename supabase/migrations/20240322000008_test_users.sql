-- Create test users for different roles
-- Note: These are for testing purposes only

-- Insert test pharmacy for demo
INSERT INTO pharmacies (id, name, license_number, address, phone, email, city, status, subscription_plan) 
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Demo Pharmacy Kigali',
  'DEMO-2024-001',
  'Demo Street, Kigali',
  '+250 788 111 111',
  'demo@pharmacy.rw',
  'Kigali',
  'active',
  'standard'
) ON CONFLICT (id) DO NOTHING;

-- Combined function to handle all user role assignments
CREATE OR REPLACE FUNCTION setup_all_users()
RETURNS TRIGGER AS $$
BEGIN
  -- Superadmin setup
  IF NEW.email = 'abdousentore@gmail.com' THEN
    INSERT INTO pharmacy_users (
      pharmacy_id,
      user_id,
      role,
      is_active
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      NEW.id,
      'admin',
      true
    ) ON CONFLICT (pharmacy_id, user_id) DO UPDATE SET
      role = 'admin',
      is_active = true;
  END IF;
  
  -- Pharmacy Owner Test User
  IF NEW.email = 'pharmacy@test.com' THEN
    INSERT INTO pharmacy_users (
      pharmacy_id,
      user_id,
      role,
      is_active
    ) VALUES (
      '11111111-1111-1111-1111-111111111111',
      NEW.id,
      'pharmacy_owner',
      true
    ) ON CONFLICT (pharmacy_id, user_id) DO UPDATE SET
      role = 'pharmacy_owner',
      is_active = true;
  END IF;
  
  -- Pharmacist Test User
  IF NEW.email = 'pharmacist@test.com' THEN
    INSERT INTO pharmacy_users (
      pharmacy_id,
      user_id,
      role,
      is_active
    ) VALUES (
      '11111111-1111-1111-1111-111111111111',
      NEW.id,
      'pharmacist',
      true
    ) ON CONFLICT (pharmacy_id, user_id) DO UPDATE SET
      role = 'pharmacist',
      is_active = true;
  END IF;
  
  -- Cashier Test User
  IF NEW.email = 'cashier@test.com' THEN
    INSERT INTO pharmacy_users (
      pharmacy_id,
      user_id,
      role,
      is_active
    ) VALUES (
      '11111111-1111-1111-1111-111111111111',
      NEW.id,
      'cashier',
      true
    ) ON CONFLICT (pharmacy_id, user_id) DO UPDATE SET
      role = 'cashier',
      is_active = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Single trigger for all user setup
DROP TRIGGER IF EXISTS setup_user_roles_trigger ON auth.users;
DROP TRIGGER IF EXISTS setup_superadmin_trigger ON auth.users;
CREATE TRIGGER setup_all_users_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION setup_all_users();

-- Setup existing test users if they exist
DO $$
DECLARE
  test_emails text[] := ARRAY['pharmacy@test.com', 'pharmacist@test.com', 'cashier@test.com'];
  test_roles text[] := ARRAY['pharmacy_owner', 'pharmacist', 'cashier'];
  user_id uuid;
  i integer;
BEGIN
  FOR i IN 1..array_length(test_emails, 1) LOOP
    SELECT id INTO user_id 
    FROM auth.users 
    WHERE email = test_emails[i];
    
    IF user_id IS NOT NULL THEN
      INSERT INTO pharmacy_users (
        pharmacy_id,
        user_id,
        role,
        is_active
      ) VALUES (
        '11111111-1111-1111-1111-111111111111',
        user_id,
        test_roles[i]::user_role,
        true
      ) ON CONFLICT (pharmacy_id, user_id) DO UPDATE SET
        role = test_roles[i]::user_role,
        is_active = true;
    END IF;
  END LOOP;
END $$;