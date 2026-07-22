-- Link medications to the category catalog (platform/pharmacy categories + global categories).

ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS global_category_id uuid REFERENCES public.global_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_medications_category_id
  ON public.medications (category_id);

CREATE INDEX IF NOT EXISTS idx_medications_global_category_id
  ON public.medications (global_category_id);

-- Platform defaults (pharmacy_id IS NULL) for legacy enum backfill.
INSERT INTO public.categories (pharmacy_id, name, description, is_active)
SELECT NULL, v.name, v.description, true
FROM (
  VALUES
    ('Prescription', 'Prescription-only medicines'),
    ('OTC', 'Over-the-counter products'),
    ('Controlled', 'Controlled substances'),
    ('Supplements', 'Vitamins and supplements'),
    ('Medical Device', 'Medical devices and supplies')
) AS v(name, description)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.categories c
  WHERE c.pharmacy_id IS NULL
    AND lower(trim(c.name)) = lower(trim(v.name))
);

-- Backfill category_id from legacy medication_category enum.
UPDATE public.medications m
SET category_id = c.id
FROM public.categories c
WHERE m.category_id IS NULL
  AND c.pharmacy_id IS NULL
  AND (
    (m.category = 'prescription'::medication_category AND lower(c.name) = 'prescription')
    OR (m.category = 'otc'::medication_category AND lower(c.name) = 'otc')
    OR (m.category = 'controlled'::medication_category AND lower(c.name) = 'controlled')
    OR (m.category = 'supplement'::medication_category AND lower(c.name) = 'supplements')
    OR (m.category = 'medical_device'::medication_category AND lower(c.name) = 'medical device')
  );

-- Prefer global catalog when name matches (admin-defined standard).
UPDATE public.medications m
SET
  global_category_id = g.id,
  category_id = NULL
FROM public.global_categories g
WHERE m.global_category_id IS NULL
  AND g.is_active IS NOT FALSE
  AND lower(trim(g.name)) = lower(trim(
    COALESCE(
      (SELECT c.name FROM public.categories c WHERE c.id = m.category_id),
      CASE m.category
        WHEN 'prescription'::medication_category THEN 'Prescription'
        WHEN 'otc'::medication_category THEN 'OTC'
        WHEN 'controlled'::medication_category THEN 'Controlled'
        WHEN 'supplement'::medication_category THEN 'Supplements'
        WHEN 'medical_device'::medication_category THEN 'Medical Device'
        ELSE 'OTC'
      END
    )
  ));
