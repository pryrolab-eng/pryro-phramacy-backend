-- RLS for insurance_templates — tenant isolation enforcement
-- Follows the established pattern from ip_whitelist, system_settings, etc.

ALTER TABLE public.insurance_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insurance_templates_pharmacy_select" ON public.insurance_templates;
CREATE POLICY "insurance_templates_pharmacy_select"
  ON public.insurance_templates FOR SELECT
  USING (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insurance_templates_pharmacy_insert" ON public.insurance_templates;
CREATE POLICY "insurance_templates_pharmacy_insert"
  ON public.insurance_templates FOR INSERT
  WITH CHECK (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insurance_templates_pharmacy_update" ON public.insurance_templates;
CREATE POLICY "insurance_templates_pharmacy_update"
  ON public.insurance_templates FOR UPDATE
  USING (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insurance_templates_pharmacy_delete" ON public.insurance_templates;
CREATE POLICY "insurance_templates_pharmacy_delete"
  ON public.insurance_templates FOR DELETE
  USING (
    pharmacy_id IN (
      SELECT pharmacy_id FROM public.pharmacy_users WHERE user_id = auth.uid()
    )
  );