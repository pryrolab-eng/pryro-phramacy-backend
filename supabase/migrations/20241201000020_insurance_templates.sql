-- Create insurance templates table
CREATE TABLE IF NOT EXISTS insurance_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    name text NOT NULL,
    insurance_provider text NOT NULL,
    template_html text,
    template_css text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_insurance_templates_pharmacy_id ON insurance_templates(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_insurance_templates_provider ON insurance_templates(insurance_provider);

-- Create trigger
CREATE TRIGGER update_insurance_templates_updated_at BEFORE UPDATE ON insurance_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();