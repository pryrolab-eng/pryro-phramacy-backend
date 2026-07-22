-- Enable RLS on system_settings if not already enabled
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their pharmacy settings" ON public.system_settings;
DROP POLICY IF EXISTS "Users can insert their pharmacy settings" ON public.system_settings;
DROP POLICY IF EXISTS "Users can update their pharmacy settings" ON public.system_settings;

-- RLS Policies for system_settings
CREATE POLICY "Users can view their pharmacy settings"
  ON public.system_settings FOR SELECT
  USING (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their pharmacy settings"
  ON public.system_settings FOR INSERT
  WITH CHECK (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their pharmacy settings"
  ON public.system_settings FOR UPDATE
  USING (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
  );
