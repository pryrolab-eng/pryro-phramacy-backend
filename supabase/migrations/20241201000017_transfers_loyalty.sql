-- Create tables for inventory transfers and customer loyalty

-- Inventory transfers table
CREATE TABLE IF NOT EXISTS inventory_transfers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    medication_name text NOT NULL,
    quantity integer NOT NULL,
    from_branch_id uuid REFERENCES branches(id),
    to_branch_id uuid REFERENCES branches(id),
    status text DEFAULT 'pending', -- pending, completed, cancelled
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);

-- Customer loyalty table
CREATE TABLE IF NOT EXISTS customer_loyalty (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
    points integer DEFAULT 0,
    tier text DEFAULT 'Bronze', -- Bronze, Silver, Gold
    total_spent decimal(10,2) DEFAULT 0.00,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_pharmacy_id ON inventory_transfers(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_status ON inventory_transfers(status);
CREATE INDEX IF NOT EXISTS idx_customer_loyalty_pharmacy_id ON customer_loyalty(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_customer_loyalty_customer_id ON customer_loyalty(customer_id);

-- Create trigger
CREATE TRIGGER update_customer_loyalty_updated_at BEFORE UPDATE ON customer_loyalty FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();