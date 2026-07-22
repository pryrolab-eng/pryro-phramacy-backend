-- Fix missing functions and create simplified setup

-- Ensure admin pharmacy exists
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

-- Ensure demo pharmacy exists
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

-- Manually setup test users if they exist
DO $$
DECLARE
  user_record RECORD;
BEGIN
  -- Setup superadmin
  FOR user_record IN SELECT id FROM auth.users WHERE email = 'abdousentore@gmail.com' LOOP
    INSERT INTO pharmacy_users (pharmacy_id, user_id, role, is_active) 
    VALUES ('00000000-0000-0000-0000-000000000000', user_record.id, 'admin', true)
    ON CONFLICT (pharmacy_id, user_id) DO UPDATE SET role = 'admin', is_active = true;
  END LOOP;
  
  -- Setup pharmacy owner test user
  FOR user_record IN SELECT id FROM auth.users WHERE email = 'pharmacy@test.com' LOOP
    INSERT INTO pharmacy_users (pharmacy_id, user_id, role, is_active) 
    VALUES ('11111111-1111-1111-1111-111111111111', user_record.id, 'pharmacy_owner', true)
    ON CONFLICT (pharmacy_id, user_id) DO UPDATE SET role = 'pharmacy_owner', is_active = true;
  END LOOP;
  
  -- Setup pharmacist test user
  FOR user_record IN SELECT id FROM auth.users WHERE email = 'pharmacist@test.com' LOOP
    INSERT INTO pharmacy_users (pharmacy_id, user_id, role, is_active) 
    VALUES ('11111111-1111-1111-1111-111111111111', user_record.id, 'pharmacist', true)
    ON CONFLICT (pharmacy_id, user_id) DO UPDATE SET role = 'pharmacist', is_active = true;
  END LOOP;
  
  -- Setup cashier test user
  FOR user_record IN SELECT id FROM auth.users WHERE email = 'cashier@test.com' LOOP
    INSERT INTO pharmacy_users (pharmacy_id, user_id, role, is_active) 
    VALUES ('11111111-1111-1111-1111-111111111111', user_record.id, 'cashier', true)
    ON CONFLICT (pharmacy_id, user_id) DO UPDATE SET role = 'cashier', is_active = true;
  END LOOP;
END $$;