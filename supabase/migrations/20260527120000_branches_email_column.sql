-- branches was first created in 20241201000015_missing_tables.sql without email.
-- SaaS migration 20250623000000 uses CREATE TABLE IF NOT EXISTS, so email was never added.

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS email text;
