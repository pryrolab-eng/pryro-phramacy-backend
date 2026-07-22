-- Insurance formulary: per-insurer covered drugs and tariff prices (imported from insurer files).

ALTER TABLE public.insurance_providers
  ADD COLUMN IF NOT EXISTS integration_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS default_coverage_percent decimal(5,2);

UPDATE public.insurance_providers
SET default_coverage_percent = COALESCE(default_coverage_percent, coverage_percentage)
WHERE default_coverage_percent IS NULL;

CREATE TABLE IF NOT EXISTS public.insurance_formulary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  insurance_provider_id uuid NOT NULL REFERENCES public.insurance_providers(id) ON DELETE CASCADE,
  medication_id uuid NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
  is_covered boolean NOT NULL DEFAULT true,
  insured_unit_price decimal(12,2),
  coverage_percent decimal(5,2),
  requires_prior_auth boolean NOT NULL DEFAULT false,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  external_code text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_insurance_formulary_global_unique
  ON public.insurance_formulary (insurance_provider_id, medication_id, effective_from)
  WHERE pharmacy_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_insurance_formulary_pharmacy_unique
  ON public.insurance_formulary (pharmacy_id, insurance_provider_id, medication_id, effective_from)
  WHERE pharmacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_insurance_formulary_provider
  ON public.insurance_formulary (insurance_provider_id, pharmacy_id);

CREATE INDEX IF NOT EXISTS idx_insurance_formulary_medication
  ON public.insurance_formulary (medication_id);

DROP TRIGGER IF EXISTS update_insurance_formulary_updated_at ON public.insurance_formulary;
CREATE TRIGGER update_insurance_formulary_updated_at
  BEFORE UPDATE ON public.insurance_formulary
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.insurance_claims
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS patient_copay decimal(12,2),
  ADD COLUMN IF NOT EXISTS covered_amount decimal(12,2);

ALTER TABLE public.insurance_claims
  ALTER COLUMN sale_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.insurance_claim_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  sale_item_id uuid REFERENCES public.sale_items(id) ON DELETE SET NULL,
  medication_id uuid REFERENCES public.medications(id) ON DELETE SET NULL,
  medication_name text,
  quantity integer NOT NULL DEFAULT 1,
  is_covered boolean NOT NULL DEFAULT false,
  shelf_unit_price decimal(12,2) NOT NULL DEFAULT 0,
  insured_unit_price decimal(12,2) NOT NULL DEFAULT 0,
  insurer_amount decimal(12,2) NOT NULL DEFAULT 0,
  patient_amount decimal(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_claim_lines_claim
  ON public.insurance_claim_lines (claim_id);

ALTER TABLE public.insurance_formulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_claim_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pharmacy staff manage formulary" ON public.insurance_formulary;
CREATE POLICY "Pharmacy staff manage formulary" ON public.insurance_formulary
  FOR ALL USING (
    pharmacy_id IS NULL
    OR pharmacy_id = ANY (get_user_pharmacy_ids())
  )
  WITH CHECK (
    pharmacy_id IS NULL
    OR pharmacy_id = ANY (get_user_pharmacy_ids())
  );

DROP POLICY IF EXISTS "Pharmacy staff view claim lines" ON public.insurance_claim_lines;
CREATE POLICY "Pharmacy staff view claim lines" ON public.insurance_claim_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.insurance_claims c
      WHERE c.id = claim_id
        AND (c.pharmacy_id IS NULL OR c.pharmacy_id = ANY (get_user_pharmacy_ids()))
    )
  );

DROP POLICY IF EXISTS "Pharmacy staff insert claim lines" ON public.insurance_claim_lines;
CREATE POLICY "Pharmacy staff insert claim lines" ON public.insurance_claim_lines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.insurance_claims c
      WHERE c.id = claim_id
        AND c.pharmacy_id = ANY (get_user_pharmacy_ids())
    )
  );
