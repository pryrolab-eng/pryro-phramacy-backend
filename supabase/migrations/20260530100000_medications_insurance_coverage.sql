-- Per-medication insurance eligibility (replaces insurance_formulary).

ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS insurance_coverage jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.medications.insurance_coverage IS
  'Map of insurance_provider_id -> { covered, externalCode, notes, effectiveFrom, effectiveTo }';

-- Migrate pharmacy-scoped formulary rows into medications.insurance_coverage
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'insurance_formulary'
  ) THEN
    UPDATE public.medications m
    SET insurance_coverage = COALESCE(m.insurance_coverage, '{}'::jsonb) || sub.merged
    FROM (
      SELECT
        f.medication_id,
        f.pharmacy_id,
        jsonb_object_agg(
          f.insurance_provider_id::text,
          jsonb_strip_nulls(
            jsonb_build_object(
              'covered', f.is_covered,
              'externalCode', f.external_code,
              'notes', f.notes,
              'effectiveFrom', f.effective_from::text,
              'effectiveTo', CASE WHEN f.effective_to IS NULL THEN NULL ELSE f.effective_to::text END
            )
          )
        ) AS merged
      FROM public.insurance_formulary f
      WHERE f.pharmacy_id IS NOT NULL
      GROUP BY f.medication_id, f.pharmacy_id
    ) sub
    WHERE m.id = sub.medication_id
      AND m.pharmacy_id = sub.pharmacy_id;
  END IF;
END $$;

DROP TABLE IF EXISTS public.insurance_formulary CASCADE;
