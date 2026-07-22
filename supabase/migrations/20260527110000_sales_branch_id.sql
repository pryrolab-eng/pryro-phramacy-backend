-- Attribute sales to a branch for reporting and per-branch limits.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_pharmacy_branch ON public.sales(pharmacy_id, branch_id);

-- Backfill: assign each pharmacy's oldest active branch to existing sales.
UPDATE public.sales s
SET branch_id = b.id
FROM (
  SELECT DISTINCT ON (pharmacy_id) pharmacy_id, id
  FROM public.branches
  WHERE is_active = true
  ORDER BY pharmacy_id, created_at ASC
) b
WHERE s.pharmacy_id = b.pharmacy_id
  AND s.branch_id IS NULL;
