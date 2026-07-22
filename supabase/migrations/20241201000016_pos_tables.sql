-- Create POS-related tables

-- Discounts table
CREATE TABLE IF NOT EXISTS discounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL, -- percentage, fixed_amount
    value decimal(10,2) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Returns table
CREATE TABLE IF NOT EXISTS returns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    sale_id uuid REFERENCES sales(id),
    reason text NOT NULL,
    refund_amount decimal(10,2) NOT NULL,
    status text DEFAULT 'processed',
    processed_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now()
);

-- Return items table
CREATE TABLE IF NOT EXISTS return_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id uuid REFERENCES returns(id) ON DELETE CASCADE,
    medication_name text NOT NULL,
    quantity integer NOT NULL,
    unit_price decimal(10,2) NOT NULL,
    total_price decimal(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE discounts;
ALTER PUBLICATION supabase_realtime ADD TABLE returns;
ALTER PUBLICATION supabase_realtime ADD TABLE return_items;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_discounts_pharmacy_id ON discounts(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_discounts_active ON discounts(is_active);
CREATE INDEX IF NOT EXISTS idx_returns_pharmacy_id ON returns(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_returns_sale_id ON returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON return_items(return_id);

-- Create triggers
CREATE TRIGGER update_discounts_updated_at BEFORE UPDATE ON discounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();