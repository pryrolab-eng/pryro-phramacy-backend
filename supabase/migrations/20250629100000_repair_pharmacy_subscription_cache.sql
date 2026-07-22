-- Repair inconsistent pharmacy subscription cache and duplicate/stale subscriptions.
-- Safe to re-run (idempotent).

-- Map catalog plan name -> pharmacies.subscription_plan enum (matches planNameToEnum).
CREATE OR REPLACE FUNCTION public.subscription_plan_enum_from_catalog_name(plan_name text)
RETURNS public.subscription_plan
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(coalesce(plan_name, '')) LIKE '%premium%' THEN 'premium'::public.subscription_plan
    WHEN lower(coalesce(plan_name, '')) LIKE '%standard%' THEN 'standard'::public.subscription_plan
    ELSE 'trial'::public.subscription_plan
  END;
$$;

-- 1) Cancel duplicate active main subscriptions (keep newest per pharmacy).
WITH ranked AS (
  SELECT
    s.id,
    ROW_NUMBER() OVER (
      PARTITION BY s.pharmacy_id
      ORDER BY coalesce(s.current_period_start, s.created_at, s.start_date) DESC NULLS LAST,
               s.created_at DESC NULLS LAST
    ) AS rn
  FROM public.subscriptions s
  WHERE s.subscription_type = 'main'
    AND s.status = 'active'
    AND coalesce(s.is_active, true) = true
)
UPDATE public.subscriptions s
SET
  status = 'cancelled',
  is_active = false,
  cancelled_at = coalesce(s.cancelled_at, now()),
  updated_at = now()
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1;

-- 2) Cancel stale unpaid checkout rows (> 30 days).
UPDATE public.subscriptions
SET
  status = 'cancelled',
  is_active = false,
  cancelled_at = coalesce(cancelled_at, now()),
  updated_at = now()
WHERE subscription_type = 'main'
  AND status IN ('pending', 'pending_payment')
  AND created_at < now() - interval '30 days';

-- 3) Sync pharmacies cache from the canonical active main subscription + catalog plan.
WITH active_main AS (
  SELECT DISTINCT ON (s.pharmacy_id)
    s.pharmacy_id,
    s.plan_id,
    s.plan AS legacy_plan_enum,
    coalesce(s.expires_at, s.current_period_end, s.end_date) AS expires_at,
    sp.name AS catalog_name,
    sp.price AS catalog_price
  FROM public.subscriptions s
  LEFT JOIN public.subscription_plans sp ON sp.id = s.plan_id
  WHERE s.subscription_type = 'main'
    AND s.status = 'active'
    AND coalesce(s.is_active, true) = true
    AND s.pharmacy_id IS NOT NULL
  ORDER BY
    s.pharmacy_id,
    coalesce(s.current_period_start, s.created_at, s.start_date) DESC NULLS LAST,
    s.created_at DESC NULLS LAST
)
UPDATE public.pharmacies p
SET
  subscription_plan = CASE
    WHEN am.catalog_name IS NOT NULL THEN public.subscription_plan_enum_from_catalog_name(am.catalog_name)
    WHEN am.legacy_plan_enum IS NOT NULL THEN am.legacy_plan_enum::public.subscription_plan
    ELSE p.subscription_plan
  END,
  subscription_expires_at = am.expires_at,
  status = CASE
    WHEN am.expires_at IS NOT NULL AND am.expires_at <= now() THEN 'suspended'::public.pharmacy_status
    ELSE 'active'::public.pharmacy_status
  END,
  updated_at = now()
FROM active_main am
WHERE p.id = am.pharmacy_id;

-- 4) Legacy: status `trial` on pharmacies meant "free plan", not blocked access.
UPDATE public.pharmacies
SET
  status = 'active'::public.pharmacy_status,
  updated_at = now()
WHERE status = 'trial'::public.pharmacy_status;

-- 5) Expired subscription cache -> suspended (no active main sub but past expiry).
UPDATE public.pharmacies p
SET
  status = 'suspended'::public.pharmacy_status,
  updated_at = now()
WHERE p.subscription_expires_at IS NOT NULL
  AND p.subscription_expires_at <= now()
  AND p.status <> 'suspended'::public.pharmacy_status
  AND NOT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.pharmacy_id = p.id
      AND s.subscription_type = 'main'
      AND s.status = 'active'
      AND coalesce(s.is_active, true) = true
  );

COMMENT ON FUNCTION public.subscription_plan_enum_from_catalog_name(text) IS
  'Maps subscription_plans.name to pharmacies.subscription_plan enum (premium/standard/trial).';
