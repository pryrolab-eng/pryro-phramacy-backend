-- Sample Data for SaaS Pharmacy Management System
-- This creates realistic test data for development and demo purposes

-- Insert sample pharmacies
INSERT INTO pharmacies (id, name, license_number, address, phone, email, city, district, province, status, subscription_plan, rra_tin) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'City Pharmacy Kigali', 'PH-2024-001', 'KN 4 Ave, Kigali', '+250 788 123 456', 'info@citypharmacy.rw', 'Kigali', 'Gasabo', 'Kigali City', 'active', 'premium', 'TIN-123456789'),
('550e8400-e29b-41d4-a716-446655440002', 'Health Plus Butare', 'PH-2024-002', 'Butare Main St', '+250 788 234 567', 'contact@healthplus.rw', 'Butare', 'Huye', 'Southern Province', 'active', 'standard', 'TIN-234567890'),
('550e8400-e29b-41d4-a716-446655440003', 'MediCare Gisenyi', 'PH-2024-003', 'Gisenyi Center', '+250 788 345 678', 'info@medicare.rw', 'Gisenyi', 'Rubavu', 'Western Province', 'trial', 'trial', 'TIN-345678901');

-- Insert insurance providers
INSERT INTO insurance_providers (pharmacy_id, name, coverage_percentage, contact_email, contact_phone, policy_number) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'RSSB (Rwanda Social Security Board)', 80.00, 'claims@rssb.rw', '+250 252 123 456', 'RSSB-2024-001'),
('550e8400-e29b-41d4-a716-446655440001', 'Radiant Insurance', 70.00, 'health@radiant.rw', '+250 252 234 567', 'RAD-2024-001'),
('550e8400-e29b-41d4-a716-446655440001', 'SONARWA', 75.00, 'medical@sonarwa.rw', '+250 252 345 678', 'SON-2024-001'),
('550e8400-e29b-41d4-a716-446655440002', 'RSSB (Rwanda Social Security Board)', 80.00, 'claims@rssb.rw', '+250 252 123 456', 'RSSB-2024-002'),
('550e8400-e29b-41d4-a716-446655440002', 'MMI (Mutual Medical Insurance)', 85.00, 'claims@mmi.rw', '+250 252 456 789', 'MMI-2024-001');

-- Insert suppliers
INSERT INTO suppliers (pharmacy_id, name, contact_person, email, phone, address) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'PharmaCorp Rwanda', 'John Uwimana', 'orders@pharmacorp.rw', '+250 788 111 222', 'Industrial Zone, Kigali'),
('550e8400-e29b-41d4-a716-446655440001', 'MediSupply Ltd', 'Marie Mukamana', 'supply@medisupply.rw', '+250 788 333 444', 'Kimisagara, Kigali'),
('550e8400-e29b-41d4-a716-446655440001', 'Global Pharma', 'Paul Nkurunziza', 'info@globalpharma.com', '+250 788 555 666', 'Remera, Kigali'),
('550e8400-e29b-41d4-a716-446655440002', 'PharmaCorp Rwanda', 'John Uwimana', 'orders@pharmacorp.rw', '+250 788 111 222', 'Industrial Zone, Kigali');

-- Insert medications
INSERT INTO medications (pharmacy_id, name, generic_name, brand_name, category, dosage_form, strength, manufacturer, barcode, requires_prescription) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Paracetamol 500mg', 'Paracetamol', 'Panadol', 'otc', 'Tablet', '500mg', 'GSK', '1234567890123', false),
('550e8400-e29b-41d4-a716-446655440001', 'Amoxicillin 250mg', 'Amoxicillin', 'Amoxil', 'prescription', 'Capsule', '250mg', 'Pfizer', '2345678901234', true),
('550e8400-e29b-41d4-a716-446655440001', 'Ibuprofen 400mg', 'Ibuprofen', 'Brufen', 'otc', 'Tablet', '400mg', 'Abbott', '3456789012345', false),
('550e8400-e29b-41d4-a716-446655440001', 'Cough Syrup 100ml', 'Dextromethorphan', 'Robitussin', 'otc', 'Syrup', '100ml', 'Reckitt', '4567890123456', false),
('550e8400-e29b-41d4-a716-446655440001', 'Vitamin C Tablets', 'Ascorbic Acid', 'Redoxon', 'supplement', 'Tablet', '1000mg', 'Bayer', '5678901234567', false),
('550e8400-e29b-41d4-a716-446655440002', 'Paracetamol 500mg', 'Paracetamol', 'Panadol', 'otc', 'Tablet', '500mg', 'GSK', '1234567890123', false),
('550e8400-e29b-41d4-a716-446655440002', 'Amoxicillin 250mg', 'Amoxicillin', 'Amoxil', 'prescription', 'Capsule', '250mg', 'Pfizer', '2345678901234', true);

-- Insert inventory
INSERT INTO inventory (pharmacy_id, medication_id, batch_number, quantity_in_stock, unit_cost, selling_price, minimum_stock_level, expiry_date, manufacturing_date) VALUES
('550e8400-e29b-41d4-a716-446655440001', (SELECT id FROM medications WHERE name = 'Paracetamol 500mg' AND pharmacy_id = '550e8400-e29b-41d4-a716-446655440001'), 'BATCH001', 45, 400.00, 600.00, 50, '2024-08-15', '2023-08-15'),
('550e8400-e29b-41d4-a716-446655440001', (SELECT id FROM medications WHERE name = 'Amoxicillin 250mg' AND pharmacy_id = '550e8400-e29b-41d4-a716-446655440001'), 'BATCH002', 120, 800.00, 1200.00, 30, '2024-12-20', '2023-12-20'),
('550e8400-e29b-41d4-a716-446655440001', (SELECT id FROM medications WHERE name = 'Ibuprofen 400mg' AND pharmacy_id = '550e8400-e29b-41d4-a716-446655440001'), 'BATCH003', 8, 500.00, 800.00, 25, '2024-06-10', '2023-06-10'),
('550e8400-e29b-41d4-a716-446655440001', (SELECT id FROM medications WHERE name = 'Cough Syrup 100ml' AND pharmacy_id = '550e8400-e29b-41d4-a716-446655440001'), 'BATCH004', 75, 1800.00, 2500.00, 20, '2025-01-15', '2024-01-15'),
('550e8400-e29b-41d4-a716-446655440001', (SELECT id FROM medications WHERE name = 'Vitamin C Tablets' AND pharmacy_id = '550e8400-e29b-41d4-a716-446655440001'), 'BATCH005', 200, 1200.00, 1800.00, 50, '2025-03-20', '2024-03-20');

-- Insert customers
INSERT INTO customers (pharmacy_id, name, phone, email, date_of_birth, gender, address, insurance_number, allergies, medical_conditions) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Jean Baptiste Uwimana', '+250 788 123 456', 'jean@email.com', '1985-05-15', 'Male', 'Kacyiru, Kigali', 'RSSB-123456789', ARRAY['Penicillin'], ARRAY['Hypertension']),
('550e8400-e29b-41d4-a716-446655440001', 'Marie Mukamana', '+250 788 234 567', 'marie@email.com', '1990-08-22', 'Female', 'Kimihurura, Kigali', 'RAD-987654321', ARRAY[]::text[], ARRAY[]::text[]),
('550e8400-e29b-41d4-a716-446655440001', 'Paul Nkurunziza', '+250 788 345 678', 'paul@email.com', '1978-12-10', 'Male', 'Remera, Kigali', NULL, ARRAY['Aspirin'], ARRAY['Diabetes']),
('550e8400-e29b-41d4-a716-446655440002', 'Eric Habimana', '+250 788 456 789', 'eric@email.com', '1982-03-18', 'Male', 'Butare Center', 'RSSB-456789123', ARRAY[]::text[], ARRAY[]::text[]);

-- Insert sample sales
INSERT INTO sales (pharmacy_id, customer_name, customer_phone, subtotal, insurance_amount, customer_amount, total_amount, payment_method, receipt_number) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Jean Baptiste Uwimana', '+250 788 123 456', 3200.00, 2560.00, 640.00, 3200.00, 'mixed', 'RCP-20240110-001'),
('550e8400-e29b-41d4-a716-446655440001', 'Marie Mukamana', '+250 788 234 567', 2800.00, 0.00, 2800.00, 2800.00, 'cash', 'RCP-20240110-002'),
('550e8400-e29b-41d4-a716-446655440001', 'Paul Nkurunziza', '+250 788 345 678', 5600.00, 0.00, 5600.00, 5600.00, 'mobile_money', 'RCP-20240110-003');

-- Insert pharmacy settings
INSERT INTO pharmacy_settings (pharmacy_id, setting_key, setting_value) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'currency', '"RWF"'),
('550e8400-e29b-41d4-a716-446655440001', 'tax_rate', '18'),
('550e8400-e29b-41d4-a716-446655440001', 'receipt_footer', '"Thank you for choosing City Pharmacy!"'),
('550e8400-e29b-41d4-a716-446655440001', 'auto_print_receipts', 'true'),
('550e8400-e29b-41d4-a716-446655440001', 'low_stock_threshold', '10'),
('550e8400-e29b-41d4-a716-446655440001', 'expiry_warning_days', '30'),
('550e8400-e29b-41d4-a716-446655440002', 'currency', '"RWF"'),
('550e8400-e29b-41d4-a716-446655440002', 'tax_rate', '18');

-- Insert notifications
INSERT INTO notifications (pharmacy_id, title, message, type) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Low Stock Alert', 'Ibuprofen 400mg is running low (8 units remaining)', 'warning'),
('550e8400-e29b-41d4-a716-446655440001', 'Expiry Warning', 'Ibuprofen 400mg expires in 15 days', 'warning'),
('550e8400-e29b-41d4-a716-446655440001', 'New Sale', 'Sale completed for RWF 3,200', 'success'),
('550e8400-e29b-41d4-a716-446655440002', 'Welcome', 'Welcome to Pryrox! Complete your setup to get started.', 'info');

-- Insert subscriptions
INSERT INTO subscriptions (pharmacy_id, plan, start_date, end_date, amount, currency) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'premium', '2024-01-01', '2024-02-01', 120000.00, 'RWF'),
('550e8400-e29b-41d4-a716-446655440002', 'standard', '2024-01-01', '2024-02-01', 50000.00, 'RWF'),
('550e8400-e29b-41d4-a716-446655440003', 'trial', '2024-01-10', '2024-01-24', 0.00, 'RWF');

-- Insert purchase orders
INSERT INTO purchase_orders (pharmacy_id, supplier_id, po_number, status, order_date, expected_delivery_date, subtotal, total_amount) VALUES
('550e8400-e29b-41d4-a716-446655440001', (SELECT id FROM suppliers WHERE name = 'PharmaCorp Rwanda' AND pharmacy_id = '550e8400-e29b-41d4-a716-446655440001'), 'PO-20240110-0001', 'sent', '2024-01-10', '2024-01-15', 450000.00, 450000.00),
('550e8400-e29b-41d4-a716-446655440001', (SELECT id FROM suppliers WHERE name = 'MediSupply Ltd' AND pharmacy_id = '550e8400-e29b-41d4-a716-446655440001'), 'PO-20240111-0002', 'pending', '2024-01-11', '2024-01-18', 320000.00, 320000.00);

-- Create views for common queries
CREATE OR REPLACE VIEW pharmacy_dashboard_stats AS
SELECT 
    p.id as pharmacy_id,
    p.name as pharmacy_name,
    COUNT(DISTINCT s.id) as total_sales_today,
    COALESCE(SUM(s.total_amount), 0) as total_revenue_today,
    COUNT(DISTINCT CASE WHEN i.quantity_in_stock <= i.minimum_stock_level THEN i.id END) as low_stock_items,
    COUNT(DISTINCT CASE WHEN i.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN i.id END) as expiring_items,
    COUNT(DISTINCT pu.user_id) as active_staff
FROM pharmacies p
LEFT JOIN sales s ON p.id = s.pharmacy_id AND DATE(s.created_at) = CURRENT_DATE
LEFT JOIN inventory i ON p.id = i.pharmacy_id
LEFT JOIN pharmacy_users pu ON p.id = pu.pharmacy_id AND pu.is_active = true
GROUP BY p.id, p.name;

-- Create view for inventory alerts
CREATE OR REPLACE VIEW inventory_alerts AS
SELECT 
    i.pharmacy_id,
    m.name as medication_name,
    i.quantity_in_stock,
    i.minimum_stock_level,
    i.expiry_date,
    CASE 
        WHEN i.quantity_in_stock <= i.minimum_stock_level THEN 'low_stock'
        WHEN i.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
        WHEN i.expiry_date <= CURRENT_DATE THEN 'expired'
        ELSE 'normal'
    END as alert_type
FROM inventory i
JOIN medications m ON i.medication_id = m.id
WHERE i.quantity_in_stock <= i.minimum_stock_level 
   OR i.expiry_date <= CURRENT_DATE + INTERVAL '30 days';

-- Grant permissions for views
GRANT SELECT ON pharmacy_dashboard_stats TO authenticated;
GRANT SELECT ON inventory_alerts TO authenticated;