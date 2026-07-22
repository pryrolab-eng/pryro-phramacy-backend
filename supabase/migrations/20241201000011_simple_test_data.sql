-- Add test medications
INSERT INTO public.medications (
  pharmacy_id, 
  name, 
  generic_name, 
  brand_name, 
  category, 
  dosage_form, 
  strength, 
  manufacturer, 
  requires_prescription,
  created_at, 
  updated_at
) VALUES 
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Paracetamol', 'Acetaminophen', 'Panadol', 'otc', 'Tablet', '500mg', 'GSK', false, now(), now()),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Amoxicillin', 'Amoxicillin', 'Amoxil', 'prescription', 'Capsule', '250mg', 'Pfizer', true, now(), now()),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Vitamin C', 'Ascorbic Acid', 'Redoxon', 'supplement', 'Tablet', '1000mg', 'Bayer', false, now(), now())
ON CONFLICT DO NOTHING;

-- Add test inventory
INSERT INTO public.inventory (
  pharmacy_id,
  medication_id,
  batch_number,
  quantity_in_stock,
  unit_cost,
  selling_price,
  minimum_stock_level,
  expiry_date,
  manufacturing_date,
  created_at,
  updated_at
) VALUES 
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (SELECT id FROM medications WHERE name = 'Paracetamol' LIMIT 1), 'PAR001', 100, 50.00, 100.00, 20, '2025-12-31', '2024-01-01', now(), now()),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (SELECT id FROM medications WHERE name = 'Amoxicillin' LIMIT 1), 'AMX001', 50, 200.00, 400.00, 10, '2025-06-30', '2024-01-01', now(), now()),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (SELECT id FROM medications WHERE name = 'Vitamin C' LIMIT 1), 'VTC001', 75, 100.00, 200.00, 15, '2026-03-31', '2024-01-01', now(), now())
ON CONFLICT DO NOTHING;