-- Display name in sidebar when customization plan feature is enabled
ALTER TABLE public.pharmacies
  ADD COLUMN IF NOT EXISTS platform_name text;
