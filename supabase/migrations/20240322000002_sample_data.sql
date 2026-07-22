-- Sample data for Pharmacy Management SaaS Platform

-- Insert sample pharmacies
INSERT INTO pharmacies (id, name, license_number, address, phone, email, city, district, province, status, subscription_plan, rra_tin) VALUES
('11111111-1111-1111-1111-111111111111', 'City Pharmacy Kigali', 'PH-KGL-2024-001', 'KN 3 Ave, Nyarugenge', '+250788123456', 'info@citypharmacy.rw', 'Kigali', 'Nyarugenge', 'Kigali City', 'active', 'premium', 'TIN123456789'),
('22222222-2222-2222-2222-222222222222', 'Health Plus Butare', 'PH-BTR-2024-002', 'Avenue de la Paix, Huye', '+250788234567', 'contact@healthplus.rw', 'Butare', 'Huye', 'Southern Province', 'active', 'standard', 'TIN234567890'),
('33333333-3333-3333-3333-333333333333', 'MediCare Gisenyi', 'PH-GSN-2024-003', 'Rubavu Center', '+250788345678', 'info@medicare.rw', 'Gisenyi', 'Rubavu', 'Western Province', 'trial', 'trial', 'TIN345678901');

-- Insert sample insurance providers
INSERT INTO insurance_providers (pharmacy_id, name, coverage_percentage, contact_email, contact_phone, policy_number) VALUES
('11111111-1111-1111-1111-111111111111', 'RSSB (Rwanda Social Security Board)', 80.00, 'claims@rssb.rw', '+250252580562', 'RSSB-2024-001'),
('11111111-1111-1111-1111-111111111111', 'Radiant Insurance', 70.00, 'medical@radiant.rw', '+250788111222', 'RAD-2024-001'),
('22222222-2222-2222-2222-222222222222', 'SONARWA', 75.00, 'health@sonarwa.rw', '+250788333444', 'SON-2024-001'),
('22222222-2222-2222-2222-222222222222', 'MMI (Mutual Medical Insurance)', 85.00, 'claims@mmi.rw', '+250788555666', 'MMI-2024-001');

-- Insert sample suppliers
INSERT INTO suppliers (pharmacy_id, name, contact_person, email, phone, address) VALUES
('11111111-1111-1111-1111-111111111111', 'Pharma Distributors Ltd', 'Jean Baptiste', 'orders@pharmadist.rw', '+250788777888', 'Industrial Zone, Kigali'),
('11111111-1111-1111-1111-111111111111', 'MedSupply Rwanda', 'Marie Uwimana', 'supply@medsupply.rw', '+250788999000', 'Kimisagara, Kigali'),
('22222222-2222-2222-2222-222222222222', 'Southern Medical Supplies', 'Paul Nkurunziza', 'info@southmed.rw', '+250788111333', 'Huye District'),
('33333333-3333-3333-3333-333333333333', 'Western Pharma Hub', 'Grace Mukamana', 'orders@westpharma.rw', '+250788222444', 'Rubavu District');

-- Insert sample medications
INSERT INTO medications (pharmacy_id, name, generic_name, brand_name, category, dosage_form, strength, manufacturer, barcode, requires_prescription) VALUES
('11111111-1111-1111-1111-111111111111', 'Paracetamol 500mg', 'Paracetamol', 'Panadol', 'otc', 'Tablet', '500mg', 'GSK', '1234567890123', false),
('11111111-1111-1111-1111-111111111111', 'Amoxicillin 250mg', 'Amoxicillin', 'Amoxil', 'prescription', 'Capsule', '250mg', 'Pfizer', '2345678901234', true),
('11111111-1111-1111-1111-111111111111', 'Ibuprofen 400mg', 'Ibuprofen', 'Brufen', 'otc', 'Tablet', '400mg', 'Abbott', '3456789012345', false),
('11111111-1111-1111-1111-111111111111', 'Cough Syrup', 'Dextromethorphan', 'Robitussin', 'otc', 'Syrup', '100ml', 'Reckitt', '4567890123456', false),
('22222222-2222-2222-2222-222222222222', 'Vitamin C 1000mg', 'Ascorbic Acid', 'Redoxon', 'supplement', 'Tablet', '1000mg', 'Bayer', '5678901234567', false),
('22222222-2222-2222-2222-222222222222', 'Aspirin 100mg', 'Acetylsalicylic Acid', 'Aspirin', 'otc', 'Tablet', '100mg', 'Bayer', '6789012345678', false),
('33333333-3333-3333-3333-333333333333', 'Omeprazole 20mg', 'Omeprazole', 'Losec', 'prescription', 'Capsule', '20mg', 'AstraZeneca', '7890123456789', true);

-- Insert sample inventory
INSERT INTO inventory (pharmacy_id, medication_id, batch_number, quantity_in_stock, unit_cost, selling_price, minimum_stock_level, expiry_date, manufacturing_date) VALUES
-- City Pharmacy Kigali inventory
('11111111-1111-1111-1111-111111111111', (SELECT id FROM medications WHERE name = 'Paracetamol 500mg' AND pharmacy_id = '11111111-1111-1111-1111-111111111111'), 'PARA-2024-001', 150, 300.00, 600.00, 50, '2025-12-31', '2024-01-15'),
('11111111-1111-1111-1111-111111111111', (SELECT id FROM medications WHERE name = 'Amoxicillin 250mg' AND pharmacy_id = '11111111-1111-1111-1111-111111111111'), 'AMOX-2024-001', 80, 800.00, 1500.00, 30, '2025-06-30', '2024-01-10'),
('11111111-1111-1111-1111-111111111111', (SELECT id FROM medications WHERE name = 'Ibuprofen 400mg' AND pharmacy_id = '11111111-1111-1111-1111-111111111111'), 'IBU-2024-001', 120, 500.00, 900.00, 25, '2025-08-15', '2024-01-20'),
('11111111-1111-1111-1111-111111111111', (SELECT id FROM medications WHERE name = 'Cough Syrup' AND pharmacy_id = '11111111-1111-1111-1111-111111111111'), 'COUGH-2024-001', 45, 1200.00, 2500.00, 20, '2025-03-30', '2024-01-05'),

-- Health Plus Butare inventory
('22222222-2222-2222-2222-222222222222', (SELECT id FROM medications WHERE name = 'Vitamin C 1000mg' AND pharmacy_id = '22222222-2222-2222-2222-222222222222'), 'VIT-2024-001', 200, 800.00, 1800.00, 50, '2026-01-31', '2024-01-25'),
('22222222-2222-2222-2222-222222222222', (SELECT id FROM medications WHERE name = 'Aspirin 100mg' AND pharmacy_id = '22222222-2222-2222-2222-222222222222'), 'ASP-2024-001', 90, 200.00, 500.00, 30, '2025-09-30', '2024-01-12'),

-- MediCare Gisenyi inventory
('33333333-3333-3333-3333-333333333333', (SELECT id FROM medications WHERE name = 'Omeprazole 20mg' AND pharmacy_id = '33333333-3333-3333-3333-333333333333'), 'OME-2024-001', 60, 1500.00, 3000.00, 20, '2025-11-30', '2024-01-18');

-- Insert sample sales
INSERT INTO sales (id, pharmacy_id, customer_name, customer_phone, subtotal, insurance_amount, customer_amount, total_amount, payment_method, receipt_number) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'John Uwimana', '+250788123789', 5500.00, 4400.00, 1100.00, 5500.00, 'mixed', 'RCP-2024-001'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Marie Mukamana', '+250788234890', 1200.00, 0.00, 1200.00, 1200.00, 'cash', 'RCP-2024-002'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'Paul Nkurunziza', '+250788345901', 3600.00, 2880.00, 720.00, 3600.00, 'mixed', 'RCP-2024-003');

-- Insert sample sale items
INSERT INTO sale_items (sale_id, inventory_id, medication_name, quantity, unit_price, total_price, batch_number) VALUES
-- Sale 1 items
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (SELECT id FROM inventory WHERE batch_number = 'PARA-2024-001'), 'Paracetamol 500mg', 2, 600.00, 1200.00, 'PARA-2024-001'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (SELECT id FROM inventory WHERE batch_number = 'AMOX-2024-001'), 'Amoxicillin 250mg', 1, 1500.00, 1500.00, 'AMOX-2024-001'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (SELECT id FROM inventory WHERE batch_number = 'COUGH-2024-001'), 'Cough Syrup', 1, 2500.00, 2500.00, 'COUGH-2024-001'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (SELECT id FROM inventory WHERE batch_number = 'IBU-2024-001'), 'Ibuprofen 400mg', 1, 900.00, 900.00, 'IBU-2024-001'),

-- Sale 2 items
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', (SELECT id FROM inventory WHERE batch_number = 'PARA-2024-001'), 'Paracetamol 500mg', 2, 600.00, 1200.00, 'PARA-2024-001'),

-- Sale 3 items
('cccccccc-cccc-cccc-cccc-cccccccccccc', (SELECT id FROM inventory WHERE batch_number = 'VIT-2024-001'), 'Vitamin C 1000mg', 2, 1800.00, 3600.00, 'VIT-2024-001');

-- Insert sample insurance claims
INSERT INTO insurance_claims (pharmacy_id, sale_id, insurance_provider_id, patient_name, patient_id_number, claim_amount, status) VALUES
('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (SELECT id FROM insurance_providers WHERE name = 'RSSB (Rwanda Social Security Board)'), 'John Uwimana', '1198012345678901', 4400.00, 'approved'),
('22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', (SELECT id FROM insurance_providers WHERE name = 'SONARWA'), 'Paul Nkurunziza', '1198023456789012', 2880.00, 'pending');

-- Insert sample subscriptions
INSERT INTO subscriptions (pharmacy_id, plan, start_date, end_date, amount, payment_reference) VALUES
('11111111-1111-1111-1111-111111111111', 'premium', '2024-01-01', '2024-12-31', 120000.00, 'PAY-2024-001'),
('22222222-2222-2222-2222-222222222222', 'standard', '2024-01-15', '2025-01-14', 50000.00, 'PAY-2024-002'),
('33333333-3333-3333-3333-333333333333', 'trial', '2024-01-20', '2024-02-03', 0.00, 'TRIAL-2024-001');