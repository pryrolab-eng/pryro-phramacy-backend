-- Insurance analytics aggregation table (monthly)
-- Derived from daily_sales_agg which already stores insurance_amount per sale

CREATE TABLE IF NOT EXISTS pryrox_analytics.insurance_monthly_agg
(
  pharmacy_id UUID,
  month Date,                          -- first day of the month
  insurance_revenue Decimal(18, 2),
  customer_revenue Decimal(18, 2),
  total_revenue Decimal(18, 2),
  insurance_orders UInt64,             -- sales with insurance_amount > 0
  total_orders UInt64
)
ENGINE = SummingMergeTree((insurance_revenue, customer_revenue, total_revenue, insurance_orders, total_orders))
PARTITION BY toYear(month)
ORDER BY (pharmacy_id, month);

CREATE MATERIALIZED VIEW IF NOT EXISTS pryrox_analytics.insurance_monthly_mv
TO pryrox_analytics.insurance_monthly_agg
AS
SELECT
  pharmacy_id,
  toStartOfMonth(created_at) AS month,
  sum(insurance_amount)  AS insurance_revenue,
  sum(customer_amount)   AS customer_revenue,
  sum(total_amount)      AS total_revenue,
  countIf(insurance_amount > 0) AS insurance_orders,
  count() AS total_orders
FROM pryrox_analytics.sales_fact
WHERE status = 'completed'
GROUP BY pharmacy_id, month;
