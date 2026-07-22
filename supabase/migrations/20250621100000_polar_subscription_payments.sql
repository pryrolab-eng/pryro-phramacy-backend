-- Polar checkout alongside KPay for subscription billing

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS polar_product_id text;

COMMENT ON COLUMN public.subscription_plans.polar_product_id IS
  'Polar product UUID; auto-filled when admin saves or syncs a paid plan to Polar.';

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'kpay',
  ADD COLUMN IF NOT EXISTS polar_checkout_id text;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_polar_checkout_id
  ON public.payment_transactions (polar_checkout_id)
  WHERE polar_checkout_id IS NOT NULL;
