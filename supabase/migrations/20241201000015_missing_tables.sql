-- Create missing tables for API conversion

-- Create function for automatic updates (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    name text NOT NULL,
    phone text,
    email text,
    date_of_birth date,
    allergies text DEFAULT 'None',
    insurance text DEFAULT 'None',
    total_purchases decimal(10,2) DEFAULT 0.00,
    last_visit date,
    status text DEFAULT 'active',
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Categories table (for medications)
CREATE TABLE IF NOT EXISTS categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Branches table
CREATE TABLE IF NOT EXISTS branches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    name text NOT NULL,
    address text,
    phone text,
    manager_id uuid REFERENCES auth.users(id),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Staff table (extends pharmacy_users)
CREATE TABLE IF NOT EXISTS staff (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id text,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    phone text,
    position text,
    department text,
    hire_date date DEFAULT CURRENT_DATE,
    salary decimal(10,2),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    title text NOT NULL,
    message text NOT NULL,
    type text DEFAULT 'info', -- info, warning, error, success
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

-- Alerts table (stock, expiry, etc.)
CREATE TABLE IF NOT EXISTS alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    type text NOT NULL, -- low_stock, expiry_warning, out_of_stock
    title text NOT NULL,
    message text NOT NULL,
    severity text DEFAULT 'medium', -- low, medium, high, critical
    is_resolved boolean DEFAULT false,
    resolved_at timestamp with time zone,
    resolved_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now()
);

-- Enable realtime for new tables (skip if already exists)
-- ALTER PUBLICATION supabase_realtime ADD TABLE customers;
-- ALTER PUBLICATION supabase_realtime ADD TABLE categories;
-- ALTER PUBLICATION supabase_realtime ADD TABLE branches;
-- ALTER PUBLICATION supabase_realtime ADD TABLE staff;
-- ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
-- ALTER PUBLICATION supabase_realtime ADD TABLE alerts;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_customers_pharmacy_id ON customers(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_categories_pharmacy_id ON categories(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_branches_pharmacy_id ON branches(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_staff_pharmacy_id ON staff(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_pharmacy_id ON notifications(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_alerts_pharmacy_id ON alerts(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_is_resolved ON alerts(is_resolved);

-- Create triggers for updated_at columns (idempotent)
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_branches_updated_at ON branches;
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_staff_updated_at ON staff;
CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample data will be inserted via APIs when pharmacies are created