-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    invoice_number text UNIQUE NOT NULL,
    amount decimal(10,2) NOT NULL,
    status text DEFAULT 'pending',
    due_date date NOT NULL,
    paid_date date,
    plan_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
    amount decimal(10,2) NOT NULL,
    payment_method text NOT NULL,
    payment_reference text,
    status text DEFAULT 'completed',
    created_at timestamp with time zone DEFAULT now()
);

-- Payment methods table
CREATE TABLE IF NOT EXISTS payment_methods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    method_type text NOT NULL,
    details jsonb,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Indexes
CREATE INDEX idx_invoices_pharmacy_id ON invoices(pharmacy_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_payments_pharmacy_id ON payments(pharmacy_id);
CREATE INDEX idx_payment_methods_pharmacy_id ON payment_methods(pharmacy_id);

-- RLS Policies
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their pharmacy invoices"
  ON invoices FOR SELECT
  USING (pharmacy_id IN (SELECT pharmacy_id FROM pharmacy_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can view their pharmacy payments"
  ON payments FOR SELECT
  USING (pharmacy_id IN (SELECT pharmacy_id FROM pharmacy_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can view their pharmacy payment methods"
  ON payment_methods FOR SELECT
  USING (pharmacy_id IN (SELECT pharmacy_id FROM pharmacy_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage their pharmacy payment methods"
  ON payment_methods FOR ALL
  USING (pharmacy_id IN (SELECT pharmacy_id FROM pharmacy_users WHERE user_id = auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_invoices_updated_at 
    BEFORE UPDATE ON invoices 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at 
    BEFORE UPDATE ON payment_methods 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate invoice numbers
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.invoice_number = 'INV-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(nextval('invoice_number_seq')::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

CREATE TRIGGER generate_invoice_number_trigger
    BEFORE INSERT ON invoices
    FOR EACH ROW 
    WHEN (NEW.invoice_number IS NULL)
    EXECUTE FUNCTION generate_invoice_number();
