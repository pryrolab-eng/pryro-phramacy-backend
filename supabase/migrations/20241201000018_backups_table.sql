-- Create backups table
CREATE TABLE IF NOT EXISTS backups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES pharmacies(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL, -- daily, weekly, manual
    file_size text,
    status text DEFAULT 'completed', -- pending, completed, failed
    created_at timestamp with time zone DEFAULT now()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_backups_pharmacy_id ON backups(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_backups_status ON backups(status);