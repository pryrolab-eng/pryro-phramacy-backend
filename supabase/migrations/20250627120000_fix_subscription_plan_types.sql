-- Fix mis-typed subscription_plans rows (main-tier names saved as branch_addon, etc.)

UPDATE public.subscription_plans
SET plan_type = 'main'
WHERE plan_type = 'branch_addon'
  AND lower(trim(name)) IN (
    'standard',
    'premium',
    'starter',
    'stater',
    'basic',
    'free',
    'trial'
  );

UPDATE public.subscription_plans
SET plan_type = 'branch_addon'
WHERE lower(trim(name)) IN (
    'branch add-on',
    'branch addon',
    'branch_addon',
    'extra branch'
  )
  AND plan_type IS DISTINCT FROM 'branch_addon';
