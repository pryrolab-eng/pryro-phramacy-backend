ALTER TABLE public.insurance_claim_lines
  ADD COLUMN IF NOT EXISTS external_code text;

COMMENT ON COLUMN public.insurance_claim_lines.external_code IS
  'Insurer drug code snapshot from medications.insurance_coverage at claim time';
