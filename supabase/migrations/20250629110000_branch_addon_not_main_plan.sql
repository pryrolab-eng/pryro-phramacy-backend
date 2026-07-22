-- Branch add-ons are not pharmacy main plans. Fix mis-typed rows and resync cache.

-- Subscriptions linked to branch_addon catalog products must be branch_addon type.
UPDATE public.subscriptions s
SET
  subscription_type = 'branch_addon',
  updated_at = now()
FROM public.subscription_plans sp
WHERE s.plan_id = sp.id
  AND (
    sp.plan_type = 'branch_addon'
    OR lower(trim(sp.name)) IN ('branch add-on', 'branch addon', 'branch_addon', 'extra branch')
    OR lower(trim(sp.name)) LIKE '%branch add%'
  )
  AND s.subscription_type = 'main';

-- Re-sync pharmacies from active MAIN subscriptions only (main-tier catalog names).
WITH active_main AS (
  SELECT DISTINCT ON (s.pharmacy_id)
    s.pharmacy_id,
    sp.name AS catalog_name,
    sp.price AS catalog_price,
    coalesce(s.expires_at, s.current_period_end, s.end_date) AS expires_at
  FROM public.subscriptions s
  INNER JOIN public.subscription_plans sp ON sp.id = s.plan_id
  WHERE s.subscription_type = 'main'
    AND s.status = 'active'
    AND coalesce(s.is_active, true) = true
    AND s.pharmacy_id IS NOT NULL
    AND sp.plan_type = 'main'
    AND lower(trim(sp.name)) NOT LIKE '%branch add%'
  ORDER BY
    s.pharmacy_id,
    coalesce(s.current_period_start, s.created_at, s.start_date) DESC NULLS LAST,
    s.created_at DESC NULLS LAST
)
UPDATE public.pharmacies p
SET
  subscription_plan = public.subscription_plan_enum_from_catalog_name(am.catalog_name),
  subscription_expires_at = am.expires_at,
  status = CASE
    WHEN am.expires_at IS NOT NULL AND am.expires_at <= now() THEN 'suspended'::public.pharmacy_status
    ELSE 'active'::public.pharmacy_status
  END,
  updated_at = now()
FROM active_main am
WHERE p.id = am.pharmacy_id;

-- Pharmacies with no main sub: keep enum, clear mistaken branch-addon-only cache via enum fallback.
UPDATE public.pharmacies p
SET
  subscription_plan = CASE
    WHEN p.subscription_plan::text IN ('premium', 'standard', 'trial') THEN p.subscription_plan
    ELSE 'trial'::public.subscription_plan
  END,
  updated_at = now()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.subscriptions s
  WHERE s.pharmacy_id = p.id
    AND s.subscription_type = 'main'
    AND s.status = 'active'
    AND coalesce(s.is_active, true) = true
);
