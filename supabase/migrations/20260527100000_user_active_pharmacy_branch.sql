-- Active tenant context for multi-pharmacy owners and branch-scoped UI.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS active_pharmacy_id uuid REFERENCES public.pharmacies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_active_pharmacy_id ON public.users(active_pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_users_active_branch_id ON public.users(active_branch_id);

COMMENT ON COLUMN public.users.active_pharmacy_id IS 'Selected pharmacy tenant for this user session context';
COMMENT ON COLUMN public.users.active_branch_id IS 'Selected branch within active_pharmacy_id';
