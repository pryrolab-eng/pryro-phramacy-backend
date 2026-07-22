-- Create test users in auth.users table using Supabase auth functions
-- Note: These should be created through Supabase Auth, but we'll ensure pharmacy associations exist

-- Ensure pharmacy_users table has the test pharmacy associations
INSERT INTO public.pharmacy_users (pharmacy_id, user_id, role, is_active, created_at, updated_at) 
SELECT 
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  id,
  CASE 
    WHEN email = 'pharmacy@test.com' THEN 'pharmacy_owner'::user_role
    WHEN email = 'pharmacist@test.com' THEN 'pharmacist'::user_role
    WHEN email = 'cashier@test.com' THEN 'cashier'::user_role
  END,
  true,
  now(),
  now()
FROM auth.users 
WHERE email IN ('pharmacy@test.com', 'pharmacist@test.com', 'cashier@test.com')
ON CONFLICT (pharmacy_id, user_id) DO NOTHING;