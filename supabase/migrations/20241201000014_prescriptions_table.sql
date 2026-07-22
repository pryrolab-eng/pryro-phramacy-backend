-- Create prescriptions table
CREATE TYPE prescription_status AS ENUM ('pending', 'dispensed', 'completed', 'cancelled');
CREATE TYPE prescription_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE IF NOT EXISTS prescriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    patient_name text NOT NULL,
    doctor_name text NOT NULL,
    medications text[] NOT NULL DEFAULT '{}',
    priority prescription_priority DEFAULT 'medium',
    status prescription_status DEFAULT 'pending',
    insurance_provider text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE prescriptions;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_prescriptions_pharmacy_id ON prescriptions(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_priority ON prescriptions(priority);

-- Create trigger for updated_at
CREATE TRIGGER update_prescriptions_updated_at 
    BEFORE UPDATE ON prescriptions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data
INSERT INTO prescriptions (pharmacy_id, patient_name, doctor_name, medications, priority, status, insurance_provider) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice Mukamana', 'Dr. Uwimana', ARRAY['Amoxicillin 500mg', 'Paracetamol 500mg'], 'high', 'pending', 'RSSB'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'John Nkurunziza', 'Dr. Habimana', ARRAY['Metformin 850mg', 'Lisinopril 10mg'], 'medium', 'completed', 'Radiant'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Grace Uwase', 'Dr. Mutesi', ARRAY['Vitamin D3', 'Calcium tablets'], 'low', 'dispensed', 'None');