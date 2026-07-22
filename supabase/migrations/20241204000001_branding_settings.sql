-- Add branding columns to pharmacies table
ALTER TABLE public.pharmacies 
ADD COLUMN IF NOT EXISTS logo_url text,
ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#3b82f6',
ADD COLUMN IF NOT EXISTS custom_domain text;

-- Create index for custom domain lookups
CREATE INDEX IF NOT EXISTS idx_pharmacies_custom_domain ON public.pharmacies(custom_domain);
