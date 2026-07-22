-- Deactivate duplicate active plans (keep one per name: Polar id > newest > oldest)
WITH ranked AS (
  SELECT
    id,
    lower(trim(name)) AS name_key,
    row_number() OVER (
      PARTITION BY lower(trim(name))
      ORDER BY
        (CASE WHEN polar_product_id IS NOT NULL AND polar_product_id <> '' THEN 0 ELSE 1 END),
        updated_at DESC NULLS LAST,
        created_at ASC
    ) AS rn
  FROM public.subscription_plans
  WHERE is_active = true
)
UPDATE public.subscription_plans sp
SET is_active = false,
    updated_at = now()
FROM ranked r
WHERE sp.id = r.id
  AND r.rn > 1;

-- Prevent duplicate active plan names going forward
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plans_active_name_unique
  ON public.subscription_plans (lower(trim(name)))
  WHERE is_active = true;
