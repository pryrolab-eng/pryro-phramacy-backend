-- Create insurance_providers table
CREATE TABLE IF NOT EXISTS insurance_providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    name text NOT NULL,
    coverage_percentage decimal(5,2) DEFAULT 80.00,
    contact_email text,
    contact_phone text,
    policy_number text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_insurance_providers_pharmacy_id ON insurance_providers(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_insurance_providers_name ON insurance_providers(name);
CREATE INDEX IF NOT EXISTS idx_insurance_providers_is_active ON insurance_providers(is_active);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_insurance_providers_updated_at ON insurance_providers;
CREATE TRIGGER update_insurance_providers_updated_at BEFORE UPDATE ON insurance_providers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE insurance_providers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Anyone can view active insurance providers" ON insurance_providers;
CREATE POLICY "Anyone can view active insurance providers" ON insurance_providers
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Superadmin can manage insurance providers" ON insurance_providers;
CREATE POLICY "Superadmin can manage insurance providers" ON insurance_providers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() 
            AND email = 'abdousentore@gmail.com'
        )
    );

-- Insert default insurance providers
INSERT INTO insurance_providers (name, coverage_percentage, pharmacy_id, is_active) VALUES
    ('RSSB', 80.00, NULL, true),
    ('MMI', 90.00, NULL, true),
    ('Radiant Insurance', 85.00, NULL, true),
    ('SONARWA', 75.00, NULL, true)
ON CONFLICT DO NOTHING;