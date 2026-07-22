-- Add policies for admin users to access global system settings (pharmacy_id IS NULL)

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their pharmacy settings" ON public.system_settings;
DROP POLICY IF EXISTS "Users can insert their pharmacy settings" ON public.system_settings;
DROP POLICY IF EXISTS "Users can update their pharmacy settings" ON public.system_settings;

-- Policy for SELECT: Users can view their pharmacy settings OR global settings
CREATE POLICY "Users can view settings"
  ON public.system_settings FOR SELECT
  USING (
    -- User's pharmacy settings
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
    OR
    -- Any authenticated user can view global settings
    pharmacy_id IS NULL
  );

-- Policy for INSERT: Users can insert their pharmacy settings OR admins can insert global settings
CREATE POLICY "Users can insert settings"
  ON public.system_settings FOR INSERT
  WITH CHECK (
    -- User's pharmacy settings
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
    OR
    -- Only admins can insert global settings
    (
      pharmacy_id IS NULL 
      AND EXISTS (
        SELECT 1 FROM public.pharmacy_users 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
      )
    )
  );

-- Policy for UPDATE: Users can update their pharmacy settings OR admins can update global settings
CREATE POLICY "Users can update settings"
  ON public.system_settings FOR UPDATE
  USING (
    -- User's pharmacy settings
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
    OR
    -- Only admins can update global settings
    (
      pharmacy_id IS NULL 
      AND EXISTS (
        SELECT 1 FROM public.pharmacy_users 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
      )
    )
  );
