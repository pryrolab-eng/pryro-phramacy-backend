-- Optional branch restrictions per staff member (pharmacy_users row).
-- No rows = access all branches in the pharmacy (legacy behavior).

CREATE TABLE IF NOT EXISTS public.staff_branch_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_user_id uuid NOT NULL REFERENCES public.pharmacy_users(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pharmacy_user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_branch_assignments_pu
  ON public.staff_branch_assignments(pharmacy_user_id);

CREATE INDEX IF NOT EXISTS idx_staff_branch_assignments_branch
  ON public.staff_branch_assignments(branch_id);

ALTER TABLE public.staff_branch_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'staff_branch_assignments' AND policyname = 'staff_branch_assignments_select'
  ) THEN
    CREATE POLICY staff_branch_assignments_select ON public.staff_branch_assignments
      FOR SELECT USING (
        pharmacy_user_id IN (
          SELECT pu.id FROM public.pharmacy_users pu
          WHERE pu.user_id = auth.uid() AND pu.is_active = true
        )
        OR EXISTS (
          SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_platform_admin = true
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.staff_branch_assignments IS
  'When empty for a staff member, they may use any branch; when populated, branch switcher is limited to these branches.';
