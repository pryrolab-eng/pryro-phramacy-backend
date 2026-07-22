-- HQ (headquarters) vs satellite branches: one distribution center per pharmacy, optional outlets.

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS is_headquarters boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.branches.is_headquarters IS
  'True for the main stocking/distribution site (HQ). Satellite branches receive stock via transfers.';

-- Mark the oldest active branch per pharmacy as HQ when none is flagged yet.
WITH first_branch AS (
  SELECT DISTINCT ON (pharmacy_id) id, pharmacy_id
  FROM public.branches
  WHERE is_active = true
  ORDER BY pharmacy_id, created_at ASC
)
UPDATE public.branches b
SET is_headquarters = true
FROM first_branch f
WHERE b.id = f.id
  AND NOT EXISTS (
    SELECT 1
    FROM public.branches hq
    WHERE hq.pharmacy_id = f.pharmacy_id
      AND hq.is_headquarters = true
  );

CREATE INDEX IF NOT EXISTS idx_branches_pharmacy_hq
  ON public.branches (pharmacy_id)
  WHERE is_headquarters = true;
