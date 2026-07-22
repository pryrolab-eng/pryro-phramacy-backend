-- Composite indexes for dashboard query performance

-- Sales: composite index for pharmacy + branch + date range queries (most common dashboard query)
CREATE INDEX IF NOT EXISTS idx_sales_pharmacy_branch_created
ON public.sales (pharmacy_id, branch_id, created_at DESC);

-- Inventory: composite index for stock alerts (pharmacy + branch + stock level)
CREATE INDEX IF NOT EXISTS idx_inventory_pharmacy_branch_stock
ON public.inventory (pharmacy_id, branch_id, quantity_in_stock, minimum_stock_level);

-- Inventory: composite index for expiry tracking
CREATE INDEX IF NOT EXISTS idx_inventory_pharmacy_branch_expiry
ON public.inventory (pharmacy_id, branch_id, expiry_date);

-- Sale items: covering index on sale_id for fast joins (sale_items has no pharmacy_id)
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id_covering
ON public.sale_items (sale_id)
INCLUDE (medication_name, total_price, quantity, unit_price);

-- Insurance claims: composite index for monthly reports (no branch_id on this table)
CREATE INDEX IF NOT EXISTS idx_insurance_claims_pharmacy_created
ON public.insurance_claims (pharmacy_id, created_at DESC);

-- Stock movements: composite index for inventory reports (no branch_id on this table)
CREATE INDEX IF NOT EXISTS idx_stock_movements_pharmacy_created
ON public.stock_movements (pharmacy_id, created_at DESC);

-- Customers: composite index for phone lookup per pharmacy
CREATE INDEX IF NOT EXISTS idx_customers_pharmacy_phone
ON public.customers (pharmacy_id, phone);

-- Pharmacy users: composite index for active staff count
CREATE INDEX IF NOT EXISTS idx_pharmacy_users_pharmacy_active
ON public.pharmacy_users (pharmacy_id, is_active);
