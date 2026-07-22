-- RLS for cashier_shifts (table created in 20260527150000 without policies).

ALTER TABLE public.cashier_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pharmacy staff can view cashier shifts" ON public.cashier_shifts;
DROP POLICY IF EXISTS "Pharmacy staff can open cashier shifts" ON public.cashier_shifts;
DROP POLICY IF EXISTS "Cashier can update own shift" ON public.cashier_shifts;

CREATE POLICY "Pharmacy staff can view cashier shifts" ON public.cashier_shifts
  FOR SELECT
  USING (pharmacy_id = ANY (public.get_user_pharmacy_ids()));

CREATE POLICY "Pharmacy staff can open cashier shifts" ON public.cashier_shifts
  FOR INSERT
  WITH CHECK (
    pharmacy_id = ANY (public.get_user_pharmacy_ids())
    AND cashier_id = auth.uid()
  );

CREATE POLICY "Cashier can update own shift" ON public.cashier_shifts
  FOR UPDATE
  USING (
    pharmacy_id = ANY (public.get_user_pharmacy_ids())
    AND cashier_id = auth.uid()
  )
  WITH CHECK (
    pharmacy_id = ANY (public.get_user_pharmacy_ids())
    AND cashier_id = auth.uid()
  );
