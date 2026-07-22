-- Create IP whitelist table
CREATE TABLE IF NOT EXISTS public.ip_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_ip_whitelist_pharmacy ON public.ip_whitelist(pharmacy_id);

-- Enable RLS
ALTER TABLE public.ip_whitelist ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their pharmacy's IP whitelist"
  ON public.ip_whitelist FOR SELECT
  USING (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert IP whitelist for their pharmacy"
  ON public.ip_whitelist FOR INSERT
  WITH CHECK (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their pharmacy's IP whitelist"
  ON public.ip_whitelist FOR UPDATE
  USING (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their pharmacy's IP whitelist"
  ON public.ip_whitelist FOR DELETE
  USING (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
  );
