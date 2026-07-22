-- Pharmacy Management SaaS Platform Database Schema

-- Create enums for various status types
CREATE TYPE user_role AS ENUM ('admin', 'pharmacy_owner', 'pharmacist', 'cashier', 'staff');
CREATE TYPE pharmacy_status AS ENUM ('active', 'inactive', 'suspended', 'trial');
CREATE TYPE subscription_plan AS ENUM ('trial', 'standard', 'premium');
CREATE TYPE medication_category AS ENUM ('prescription', 'otc', 'controlled', 'supplement', 'medical_device');
CREATE TYPE sale_status AS ENUM ('completed', 'pending', 'cancelled', 'refunded');
CREATE TYPE insurance_claim_status AS ENUM ('pending', 'approved', 'rejected', 'processing');
CREATE TYPE payment_method AS ENUM ('cash', 'card', 'mobile_money', 'insurance', 'mixed');

-- Pharmacies table (multi-tenant)
CREATE TABLE IF NOT EXISTS pharmacies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    license_number text UNIQUE NOT NULL,
    owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    address text,
    phone text,
    email text,
    city text,
    district text,
    province text,
    status pharmacy_status DEFAULT 'trial',
    subscription_plan subscription_plan DEFAULT 'trial',
    subscription_expires_at timestamp with time zone,
    rra_tin text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Pharmacy users (staff management)
CREATE TABLE IF NOT EXISTS pharmacy_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(pharmacy_id, user_id)
);

-- Insurance providers
CREATE TABLE IF NOT EXISTS insurance_providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    name text NOT NULL,
    coverage_percentage decimal(5,2) DEFAULT 0.00,
    contact_email text,
    contact_phone text,
    policy_number text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Medication categories and suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    name text NOT NULL,
    contact_person text,
    email text,
    phone text,
    address text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Medications master table
CREATE TABLE IF NOT EXISTS medications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    name text NOT NULL,
    generic_name text,
    brand_name text,
    category medication_category DEFAULT 'otc',
    dosage_form text,
    strength text,
    manufacturer text,
    barcode text,
    description text,
    requires_prescription boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Inventory management
CREATE TABLE IF NOT EXISTS inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    medication_id uuid REFERENCES medications(id) ON DELETE CASCADE,
    supplier_id uuid REFERENCES suppliers(id),
    batch_number text NOT NULL,
    quantity_in_stock integer DEFAULT 0,
    unit_cost decimal(10,2) DEFAULT 0.00,
    selling_price decimal(10,2) DEFAULT 0.00,
    minimum_stock_level integer DEFAULT 0,
    expiry_date date,
    manufacturing_date date,
    received_date timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Sales transactions
CREATE TABLE IF NOT EXISTS sales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    cashier_id uuid REFERENCES auth.users(id),
    customer_name text,
    customer_phone text,
    insurance_provider_id uuid REFERENCES insurance_providers(id),
    subtotal decimal(10,2) DEFAULT 0.00,
    insurance_amount decimal(10,2) DEFAULT 0.00,
    customer_amount decimal(10,2) DEFAULT 0.00,
    total_amount decimal(10,2) DEFAULT 0.00,
    payment_method payment_method DEFAULT 'cash',
    status sale_status DEFAULT 'completed',
    rra_invoice_number text,
    receipt_number text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Sale items (line items for each sale)
CREATE TABLE IF NOT EXISTS sale_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id uuid REFERENCES sales(id) ON DELETE CASCADE,
    inventory_id uuid REFERENCES inventory(id),
    medication_name text NOT NULL,
    quantity integer NOT NULL,
    unit_price decimal(10,2) NOT NULL,
    total_price decimal(10,2) NOT NULL,
    batch_number text,
    expiry_date date,
    created_at timestamp with time zone DEFAULT now()
);

-- Insurance claims
CREATE TABLE IF NOT EXISTS insurance_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    sale_id uuid REFERENCES sales(id) ON DELETE CASCADE,
    insurance_provider_id uuid REFERENCES insurance_providers(id),
    claim_number text UNIQUE,
    patient_name text NOT NULL,
    patient_id_number text,
    claim_amount decimal(10,2) NOT NULL,
    approved_amount decimal(10,2) DEFAULT 0.00,
    status insurance_claim_status DEFAULT 'pending',
    submitted_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Stock movements (for inventory tracking)
CREATE TABLE IF NOT EXISTS stock_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    inventory_id uuid REFERENCES inventory(id) ON DELETE CASCADE,
    movement_type text NOT NULL, -- 'in', 'out', 'adjustment', 'expired', 'damaged'
    quantity integer NOT NULL,
    reference_id uuid, -- Could reference sale_id, purchase_id, etc.
    reference_type text, -- 'sale', 'purchase', 'adjustment', etc.
    notes text,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now()
);

-- Subscription management
CREATE TABLE IF NOT EXISTS subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    plan subscription_plan NOT NULL,
    start_date timestamp with time zone DEFAULT now(),
    end_date timestamp with time zone,
    is_active boolean DEFAULT true,
    amount decimal(10,2) DEFAULT 0.00,
    currency text DEFAULT 'RWF',
    payment_reference text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE pharmacies;
ALTER PUBLICATION supabase_realtime ADD TABLE pharmacy_users;
ALTER PUBLICATION supabase_realtime ADD TABLE insurance_providers;
ALTER PUBLICATION supabase_realtime ADD TABLE suppliers;
ALTER PUBLICATION supabase_realtime ADD TABLE medications;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE sales;
ALTER PUBLICATION supabase_realtime ADD TABLE sale_items;
ALTER PUBLICATION supabase_realtime ADD TABLE insurance_claims;
ALTER PUBLICATION supabase_realtime ADD TABLE stock_movements;
ALTER PUBLICATION supabase_realtime ADD TABLE subscriptions;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pharmacies_owner_id ON pharmacies(owner_id);
CREATE INDEX IF NOT EXISTS idx_pharmacies_status ON pharmacies(status);
CREATE INDEX IF NOT EXISTS idx_pharmacy_users_pharmacy_id ON pharmacy_users(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_users_user_id ON pharmacy_users(user_id);
CREATE INDEX IF NOT EXISTS idx_medications_pharmacy_id ON medications(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_medications_barcode ON medications(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_pharmacy_id ON inventory(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_inventory_medication_id ON inventory(medication_id);
CREATE INDEX IF NOT EXISTS idx_inventory_expiry_date ON inventory(expiry_date);
CREATE INDEX IF NOT EXISTS idx_sales_pharmacy_id ON sales(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_pharmacy_id ON insurance_claims(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_status ON insurance_claims(status);
CREATE INDEX IF NOT EXISTS idx_stock_movements_pharmacy_id ON stock_movements(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_inventory_id ON stock_movements(inventory_id);

-- Create functions for automatic updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_pharmacies_updated_at BEFORE UPDATE ON pharmacies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pharmacy_users_updated_at BEFORE UPDATE ON pharmacy_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_insurance_providers_updated_at BEFORE UPDATE ON insurance_providers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_medications_updated_at BEFORE UPDATE ON medications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_insurance_claims_updated_at BEFORE UPDATE ON insurance_claims FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically update stock when sale is made
CREATE OR REPLACE FUNCTION handle_sale_stock_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Update inventory quantity
    UPDATE inventory 
    SET quantity_in_stock = quantity_in_stock - NEW.quantity
    WHERE id = NEW.inventory_id;
    
    -- Create stock movement record
    INSERT INTO stock_movements (
        pharmacy_id,
        inventory_id,
        movement_type,
        quantity,
        reference_id,
        reference_type,
        created_by
    ) VALUES (
        (SELECT pharmacy_id FROM inventory WHERE id = NEW.inventory_id),
        NEW.inventory_id,
        'out',
        NEW.quantity,
        NEW.sale_id,
        'sale',
        (SELECT cashier_id FROM sales WHERE id = NEW.sale_id)
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for stock updates on sale
CREATE TRIGGER handle_sale_stock_update_trigger
    AFTER INSERT ON sale_items
    FOR EACH ROW EXECUTE FUNCTION handle_sale_stock_update();

-- Function to generate claim numbers
CREATE OR REPLACE FUNCTION generate_claim_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.claim_number = 'CLM-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(nextval('claim_number_seq')::text, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create sequence for claim numbers
CREATE SEQUENCE IF NOT EXISTS claim_number_seq START 1;

-- Create trigger for claim number generation
CREATE TRIGGER generate_claim_number_trigger
    BEFORE INSERT ON insurance_claims
    FOR EACH ROW EXECUTE FUNCTION generate_claim_number();