-- Create global entities that can be shared across all pharmacies

-- Global categories table
CREATE TABLE IF NOT EXISTS global_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Global insurance providers table
CREATE TABLE IF NOT EXISTS global_insurance_providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    coverage_percentage decimal(5,2) DEFAULT 0.00,
    contact_email text,
    contact_phone text,
    policy_number text,
    is_active boolean DEFAULT true,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on global tables
ALTER TABLE global_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_insurance_providers ENABLE ROW LEVEL SECURITY;

-- RLS policies for global categories (readable by all, writable by superadmin)
CREATE POLICY "Anyone can view global categories" ON global_categories
    FOR SELECT USING (is_active = true);

CREATE POLICY "Superadmin can manage global categories" ON global_categories
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() 
            AND email = 'abdousentore@gmail.com'
        )
    );

-- RLS policies for global insurance providers (readable by all, writable by superadmin)
CREATE POLICY "Anyone can view global insurance providers" ON global_insurance_providers
    FOR SELECT USING (is_active = true);

CREATE POLICY "Superadmin can manage global insurance providers" ON global_insurance_providers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() 
            AND email = 'abdousentore@gmail.com'
        )
    );

-- Update existing RLS policies for pharmacies to allow superadmin full access
DROP POLICY IF EXISTS "Superadmin can view all pharmacies" ON pharmacies;
DROP POLICY IF EXISTS "Superadmin can manage all pharmacies" ON pharmacies;

CREATE POLICY "Superadmin can view all pharmacies" ON pharmacies
    FOR SELECT USING (
        id = ANY(get_user_pharmacy_ids()) OR 
        owner_id = auth.uid() OR 
        is_admin() OR
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() 
            AND email = 'abdousentore@gmail.com'
        )
    );

CREATE POLICY "Superadmin can manage all pharmacies" ON pharmacies
    FOR ALL USING (
        owner_id = auth.uid() OR 
        is_admin() OR
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() 
            AND email = 'abdousentore@gmail.com'
        )
    );

-- Add triggers for updated_at columns
CREATE TRIGGER update_global_categories_updated_at 
    BEFORE UPDATE ON global_categories 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_global_insurance_providers_updated_at 
    BEFORE UPDATE ON global_insurance_providers 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default global categories
INSERT INTO global_categories (name, description, is_active) VALUES
    ('Prescription Medications', 'Medications requiring prescription', true),
    ('Over-the-Counter', 'Non-prescription medications', true),
    ('Supplements', 'Vitamins and dietary supplements', true),
    ('Medical Devices', 'Medical equipment and devices', true),
    ('Personal Care', 'Personal hygiene products', true),
    ('Baby Care', 'Baby and infant care products', true)
ON CONFLICT DO NOTHING;

-- Insert default global insurance providers
INSERT INTO global_insurance_providers (name, coverage_percentage, is_active) VALUES
    ('RSSB', 80.00, true),
    ('MMI', 90.00, true),
    ('Radiant Insurance', 85.00, true),
    ('SONARWA', 75.00, true)
ON CONFLICT DO NOTHING;

-- Create junction table for pharmacy-specific insurance provider relationships
CREATE TABLE IF NOT EXISTS pharmacy_insurance_providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    insurance_provider_id uuid REFERENCES insurance_providers(id) ON DELETE CASCADE,
    global_insurance_provider_id uuid REFERENCES global_insurance_providers(id) ON DELETE CASCADE,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE(pharmacy_id, insurance_provider_id),
    UNIQUE(pharmacy_id, global_insurance_provider_id)
);

-- Enable RLS on junction table
ALTER TABLE pharmacy_insurance_providers ENABLE ROW LEVEL SECURITY;

-- RLS policy for pharmacy insurance provider relationships
CREATE POLICY "Pharmacy staff can view their insurance relationships" ON pharmacy_insurance_providers
    FOR SELECT USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

CREATE POLICY "Pharmacy staff can manage their insurance relationships" ON pharmacy_insurance_providers
    FOR ALL USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE global_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE global_insurance_providers;
ALTER PUBLICATION supabase_realtime ADD TABLE pharmacy_insurance_providers;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_global_categories_active ON global_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_global_insurance_providers_active ON global_insurance_providers(is_active);
CREATE INDEX IF NOT EXISTS idx_pharmacy_insurance_providers_pharmacy_id ON pharmacy_insurance_providers(pharmacy_id);