-- Add currency column to subscription_plans for per-plan pricing display

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'RWF';