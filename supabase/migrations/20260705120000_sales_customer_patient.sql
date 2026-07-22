-- Link sales to registered customers (payer) and store Rx patient separately.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS patient_name text;

CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON public.sales(customer_id);

COMMENT ON COLUMN public.sales.customer_id IS 'Registered payer/customer account when selected at POS; NULL for walk-in payer.';
COMMENT ON COLUMN public.sales.patient_name IS 'Person receiving medication when different from payer or on Rx sales.';
