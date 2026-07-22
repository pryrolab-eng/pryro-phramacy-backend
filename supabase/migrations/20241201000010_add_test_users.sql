-- Create a test pharmacy for testing
INSERT INTO public.pharmacies (
  id, 
  name, 
  license_number,
  address,
  phone,
  email,
  city,
  district,
  province,
  subscription_plan, 
  status, 
  created_at, 
  updated_at
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 
  'Test Pharmacy', 
  'LIC-TEST-001',
  'KN 5 Ave, Kigali',
  '+250788123456',
  'test@pharmacy.com',
  'Kigali', 
  'Gasabo',
  'Kigali City',
  'standard', 
  'active', 
  now(), 
  now()
) ON CONFLICT (id) DO NOTHING;

-- Add some test suppliers
INSERT INTO public.suppliers (pharmacy_id, name, contact_person, email, phone, address, created_at, updated_at) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rwanda Pharma Supply', 'Jean Baptiste', 'supply@rwandapharma.com', '+250788111222', 'Kigali Industrial Park', now(), now()),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'MediCare Distributors', 'Marie Uwimana', 'info@medicare.rw', '+250788333444', 'Remera, Kigali', now(), now())
ON CONFLICT DO NOTHING;

-- Add test insurance providers
INSERT INTO public.insurance_providers (pharmacy_id, name, coverage_percentage, contact_email, contact_phone, created_at, updated_at) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RSSB', 80.00, 'claims@rssb.rw', '+250788555666', now(), now()),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Radiant Insurance', 75.00, 'medical@radiant.rw', '+250788777888', now(), now()),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SONARWA', 70.00, 'health@sonarwa.rw', '+250788999000', now(), now())
ON CONFLICT DO NOTHING;