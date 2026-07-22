-- SaaS Platform Extensions
-- Additional tables for complete pharmacy management system

-- Audit logs for compliance and security
CREATE TABLE IF NOT EXISTS audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    action text NOT NULL,
    table_name text,
    record_id uuid,
    old_values jsonb,
    new_values jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);

-- Customer management
CREATE TABLE IF NOT EXISTS customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    name text NOT NULL,
    phone text,
    email text,
    date_of_birth date,
    gender text,
    address text,
    insurance_provider_id uuid REFERENCES insurance_providers(id),
    insurance_number text,
    allergies text[],
    medical_conditions text[],
    emergency_contact_name text,
    emergency_contact_phone text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Purchase orders for supplier management
CREATE TABLE IF NOT EXISTS purchase_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    supplier_id uuid REFERENCES suppliers(id),
    po_number text UNIQUE NOT NULL,
    status text DEFAULT 'pending', -- pending, sent, received, cancelled
    order_date timestamp with time zone DEFAULT now(),
    expected_delivery_date date,
    actual_delivery_date date,
    subtotal decimal(10,2) DEFAULT 0.00,
    tax_amount decimal(10,2) DEFAULT 0.00,
    total_amount decimal(10,2) DEFAULT 0.00,
    notes text,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Purchase order items
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
    medication_id uuid REFERENCES medications(id),
    quantity_ordered integer NOT NULL,
    quantity_received integer DEFAULT 0,
    unit_cost decimal(10,2) NOT NULL,
    total_cost decimal(10,2) NOT NULL,
    batch_number text,
    expiry_date date,
    created_at timestamp with time zone DEFAULT now()
);

-- System settings per pharmacy
CREATE TABLE IF NOT EXISTS pharmacy_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    setting_key text NOT NULL,
    setting_value jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(pharmacy_id, setting_key)
);

-- Notifications system
CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    title text NOT NULL,
    message text NOT NULL,
    type text DEFAULT 'info', -- info, warning, error, success
    is_read boolean DEFAULT false,
    action_url text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);

-- API keys for integrations
CREATE TABLE IF NOT EXISTS api_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    name text NOT NULL,
    key_hash text NOT NULL,
    key_prefix text NOT NULL,
    permissions text[] DEFAULT '{}',
    is_active boolean DEFAULT true,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now()
);

-- Webhooks configuration
CREATE TABLE IF NOT EXISTS webhooks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    endpoint_url text NOT NULL,
    secret_key text,
    is_active boolean DEFAULT true,
    retry_count integer DEFAULT 3,
    last_triggered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Webhook delivery logs
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id uuid REFERENCES webhooks(id) ON DELETE CASCADE,
    event_data jsonb NOT NULL,
    response_status integer,
    response_body text,
    delivered_at timestamp with time zone DEFAULT now(),
    retry_count integer DEFAULT 0
);

-- Reports and analytics cache
CREATE TABLE IF NOT EXISTS report_cache (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    report_type text NOT NULL,
    parameters jsonb,
    data jsonb NOT NULL,
    generated_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone
);

-- Mobile app sessions
CREATE TABLE IF NOT EXISTS mobile_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    device_id text NOT NULL,
    device_type text, -- ios, android
    app_version text,
    push_token text,
    is_active boolean DEFAULT true,
    last_activity_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);

-- Create indexes for new tables
CREATE INDEX IF NOT EXISTS idx_audit_logs_pharmacy_id ON audit_logs(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_customers_pharmacy_id ON customers(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_pharmacy_id ON purchase_orders(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_settings_pharmacy_id ON pharmacy_settings(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_notifications_pharmacy_id ON notifications(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_pharmacy_id ON api_keys(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_pharmacy_id ON webhooks(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_user_id ON mobile_sessions(user_id);

-- Add triggers for updated_at columns
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pharmacy_settings_updated_at BEFORE UPDATE ON pharmacy_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON webhooks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to create audit log entries
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    pharmacy_id_val uuid;
BEGIN
    -- Get pharmacy_id from the record
    IF TG_TABLE_NAME = 'pharmacies' THEN
        pharmacy_id_val := COALESCE(NEW.id, OLD.id);
    ELSE
        pharmacy_id_val := COALESCE(NEW.pharmacy_id, OLD.pharmacy_id);
    END IF;

    INSERT INTO audit_logs (
        pharmacy_id,
        user_id,
        action,
        table_name,
        record_id,
        old_values,
        new_values
    ) VALUES (
        pharmacy_id_val,
        auth.uid(),
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit triggers for key tables
CREATE TRIGGER audit_pharmacies AFTER INSERT OR UPDATE OR DELETE ON pharmacies FOR EACH ROW EXECUTE FUNCTION create_audit_log();
CREATE TRIGGER audit_sales AFTER INSERT OR UPDATE OR DELETE ON sales FOR EACH ROW EXECUTE FUNCTION create_audit_log();
CREATE TRIGGER audit_inventory AFTER INSERT OR UPDATE OR DELETE ON inventory FOR EACH ROW EXECUTE FUNCTION create_audit_log();
CREATE TRIGGER audit_pharmacy_users AFTER INSERT OR UPDATE OR DELETE ON pharmacy_users FOR EACH ROW EXECUTE FUNCTION create_audit_log();

-- Function to generate PO numbers
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.po_number = 'PO-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(nextval('po_number_seq')::text, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create sequence for PO numbers
CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1;

-- Create trigger for PO number generation
CREATE TRIGGER generate_po_number_trigger
    BEFORE INSERT ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION generate_po_number();

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE customers;
ALTER PUBLICATION supabase_realtime ADD TABLE purchase_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE mobile_sessions;