-- Per-branch stock: inventory rows belong to a branch within the pharmacy.

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_branch_id ON public.inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_pharmacy_branch ON public.inventory(pharmacy_id, branch_id);

-- Backfill existing rows to each pharmacy's oldest active branch.
UPDATE public.inventory i
SET branch_id = b.id
FROM (
  SELECT DISTINCT ON (pharmacy_id) id, pharmacy_id
  FROM public.branches
  WHERE is_active = true
  ORDER BY pharmacy_id, created_at ASC
) b
WHERE i.pharmacy_id = b.pharmacy_id
  AND i.branch_id IS NULL;

COMMENT ON COLUMN public.inventory.branch_id IS 'Branch that holds this stock batch';
