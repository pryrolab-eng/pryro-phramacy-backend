-- Create superadmin setup for abdousentore@gmail.com

-- First, let's create a superadmin pharmacy if it doesn't exist
INSERT INTO pharmacies (id, name, license_number, address, phone, email, city, status, subscription_plan) 
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Pryrox Admin',
  'ADMIN-2024-001',
  'Kigali, Rwanda',
  '+250 788 000 000',
  'admin@pryrox.com',
  'Kigali',
  'active',
  'premium'
) ON CONFLICT (id) DO NOTHING;

-- Function to setup superadmin user
CREATE OR REPLACE FUNCTION setup_superadmin_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if this is the superadmin email
  IF NEW.email = 'abdousentore@gmail.com' THEN
    -- Insert into pharmacy_users with admin role
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
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new users
DROP TRIGGER IF EXISTS setup_superadmin_trigger ON auth.users;
CREATE TRIGGER setup_superadmin_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION setup_superadmin_user();

-- Also setup for existing user if they exist
DO $$
DECLARE
  admin_user_id uuid;
BEGIN
  -- Get the user ID for the superadmin email
  SELECT id INTO admin_user_id 
  FROM auth.users 
  WHERE email = 'abdousentore@gmail.com';
  
  -- If user exists, set them up as superadmin
  IF admin_user_id IS NOT NULL THEN
    INSERT INTO pharmacy_users (
      pharmacy_id,
      user_id,
      role,
      is_active
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      admin_user_id,
      'admin',
      true
    ) ON CONFLICT (pharmacy_id, user_id) DO UPDATE SET
      role = 'admin',
      is_active = true;
  END IF;
END $$;

-- Update RLS policies to allow superadmin access
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM auth.users 
        WHERE id = auth.uid() 
        AND email = 'abdousentore@gmail.com'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update pharmacy policies to include superadmin
DROP POLICY IF EXISTS "Superadmin can view all pharmacies" ON pharmacies;
CREATE POLICY "Superadmin can view all pharmacies" ON pharmacies
    FOR SELECT USING (is_superadmin());

DROP POLICY IF EXISTS "Superadmin can manage all pharmacies" ON pharmacies;
CREATE POLICY "Superadmin can manage all pharmacies" ON pharmacies
    FOR ALL USING (is_superadmin());