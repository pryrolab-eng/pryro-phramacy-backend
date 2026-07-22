-- Allow pharmacy owners to create/update subscription rows for pharmacies they own.
-- (Previously only SELECT for owners + ALL for admins.)

CREATE POLICY "Pharmacy owners can insert subscriptions for owned pharmacy"
  ON public.subscriptions
  FOR INSERT
  WITH CHECK (
    pharmacy_id IN (
      SELECT id FROM public.pharmacies WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Pharmacy owners can update subscriptions for owned pharmacy"
  ON public.subscriptions
  FOR UPDATE
  USING (
    pharmacy_id IN (
      SELECT id FROM public.pharmacies WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    pharmacy_id IN (
      SELECT id FROM public.pharmacies WHERE owner_id = auth.uid()
    )
  );

-- First-time owner: add themselves as pharmacy_owner (RLS already allows owner staff policy;
-- this policy makes self-insert explicit for new pharmacies.)
CREATE POLICY "Owners can self-assign as pharmacy_owner"
  ON public.pharmacy_users
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'pharmacy_owner'::public.user_role
    AND pharmacy_id IN (SELECT id FROM public.pharmacies WHERE owner_id = auth.uid())
  );

-- Newer subscription rows use subscription_plans.id; keep column if missing.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.subscription_plans (id);

-- Allow inserts that only set plan_id + expires_at (legacy enum plan may be omitted).
ALTER TABLE public.subscriptions
  ALTER COLUMN plan DROP NOT NULL;
