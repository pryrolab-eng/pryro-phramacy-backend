-- Create system settings table
CREATE TABLE IF NOT EXISTS public.system_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    setting_key text NOT NULL,
    setting_value jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(pharmacy_id, setting_key)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_system_settings_pharmacy_id ON public.system_settings(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON public.system_settings(setting_key);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (idempotent)
DROP POLICY IF EXISTS "Users can view their pharmacy settings" ON public.system_settings;
CREATE POLICY "Users can view their pharmacy settings"
  ON public.system_settings FOR SELECT
  USING (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their pharmacy settings" ON public.system_settings;
CREATE POLICY "Users can insert their pharmacy settings"
  ON public.system_settings FOR INSERT
  WITH CHECK (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their pharmacy settings" ON public.system_settings;
CREATE POLICY "Users can update their pharmacy settings"
  ON public.system_settings FOR UPDATE
  USING (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
  );
