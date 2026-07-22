import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const SALE_ID = "7530f89a-b923-4e5a-bc6c-ee9a60de05f8";
const PHARMACY_ID = "37f5f20e-8d92-4d9c-b75e-f13e530bfa61";

export class SaleListItemDto {
  @ApiProperty({ description: "Sale identifier.", example: SALE_ID, format: "uuid" })
  id!: string;
  @ApiProperty({ description: "Customer display name.", example: "Walk-in Customer" })
  customer!: string;
  @ApiProperty({ description: "Stored sale total.", example: "15000.00", nullable: true })
  amount!: string | number | null;
  @ApiProperty({ description: "Number of sale item rows.", example: 2 })
  items!: number;
  @ApiProperty({ description: "Sale date in YYYY-MM-DD form.", example: "2026-07-21" })
  date!: string;
  @ApiProperty({ description: "Payment method.", example: "cash", nullable: true })
  paymentMethod!: string | null;
  @ApiProperty({ description: "Sale status.", example: "completed", nullable: true })
  status!: string | null;
}

export class SalesStatsDto {
  @ApiProperty({ description: "Revenue recorded since local midnight.", example: 42000 })
  todayTotal!: number;
  @ApiProperty({ description: "Revenue recorded during the last seven days.", example: 258000 })
  weekTotal!: number;
  @ApiProperty({ description: "Revenue recorded during the last thirty days.", example: 975000 })
  monthTotal!: number;
  @ApiProperty({ description: "Number of sales returned by the current list query.", example: 42 })
  totalSales!: number;
}

export class SalesListResponseDto {
  @ApiProperty({ description: "Filtered sales, newest first.", type: [SaleListItemDto] })
  sales!: SaleListItemDto[];
  @ApiProperty({ description: "Unfiltered pharmacy revenue windows and returned-list count.", type: SalesStatsDto })
  stats!: SalesStatsDto;
}

export class StoredSaleDto {
  @ApiProperty({ description: "Sale identifier.", example: SALE_ID, format: "uuid" })
  id!: string;
  @ApiProperty({ description: "Owning pharmacy identifier.", example: PHARMACY_ID, format: "uuid", nullable: true })
  pharmacy_id!: string | null;
  @ApiProperty({ description: "Cashier user identifier.", example: null, format: "uuid", nullable: true })
  cashier_id!: string | null;
  @ApiProperty({ description: "Registered customer identifier.", example: null, format: "uuid", nullable: true })
  customer_id!: string | null;
  @ApiProperty({ description: "Customer display name.", example: "Walk-in Customer", nullable: true })
  customer_name!: string | null;
  @ApiProperty({ description: "Customer phone number.", example: null, nullable: true })
  customer_phone!: string | null;
  @ApiProperty({ description: "Patient name.", example: null, nullable: true })
  patient_name!: string | null;
  @ApiProperty({ description: "Insurance provider identifier.", example: null, format: "uuid", nullable: true })
  insurance_provider_id!: string | null;
  @ApiProperty({ description: "Sale subtotal.", example: "15000.00", nullable: true })
  subtotal!: string | number | null;
  @ApiProperty({ description: "Insurance-covered amount.", example: "5000.00", nullable: true })
  insurance_amount!: string | number | null;
  @ApiProperty({ description: "Customer-paid amount.", example: "10000.00", nullable: true })
  customer_amount!: string | number | null;
  @ApiProperty({ description: "Final sale total.", example: "15000.00", nullable: true })
  total_amount!: string | number | null;
  @ApiProperty({ description: "Payment method.", example: "cash", nullable: true })
  payment_method!: string | null;
  @ApiProperty({ description: "Sale status.", example: "completed", nullable: true })
  status!: string | null;
  @ApiProperty({ description: "RRA invoice number.", example: null, nullable: true })
  rra_invoice_number!: string | null;
  @ApiProperty({ description: "Generated receipt number.", example: "RCP-1784642718000", nullable: true })
  receipt_number!: string | null;
  @ApiProperty({ description: "Sale notes.", example: null, nullable: true })
  notes!: string | null;
  @ApiProperty({ description: "Creation timestamp.", example: "2026-07-21T12:25:18.000Z", format: "date-time", nullable: true })
  created_at!: string | null;
  @ApiProperty({ description: "Last update timestamp.", example: "2026-07-21T12:25:18.000Z", format: "date-time", nullable: true })
  updated_at!: string | null;
  @ApiProperty({ description: "Branch identifier.", example: null, format: "uuid", nullable: true })
  branch_id!: string | null;
  @ApiProperty({ description: "Cashier shift identifier.", example: null, format: "uuid", nullable: true })
  shift_id!: string | null;
}

export class CreateSaleResponseDto {
  @ApiProperty({ description: "Whether sale processing succeeded.", example: true })
  success!: boolean;
  @ApiPropertyOptional({ description: "Created sale header.", type: StoredSaleDto })
  sale?: StoredSaleDto;
  @ApiPropertyOptional({ description: "Generic processing failure message.", example: "Failed to process sale" })
  error?: string;
}

export class DailySaleDto {
  @ApiProperty({ description: "Calendar date.", example: "2026-07-21", format: "date" })
  date!: string;
  @ApiProperty({ description: "Rounded revenue on this date.", example: 152000 })
  sales!: number;
  @ApiProperty({ description: "Number of orders on this date.", example: 18 })
  orders!: number;
}

export class TopProductDto {
  @ApiProperty({ description: "Medication name.", example: "Amoxicillin 500 mg" })
  name!: string;
  @ApiProperty({ description: "Rounded product revenue.", example: 86000 })
  sales!: number;
  @ApiProperty({ description: "Units sold.", example: 24 })
  quantity!: number;
}

export class ReportPaymentDto {
  @ApiProperty({ description: "Display payment method.", example: "Cash" })
  method!: string;
  @ApiProperty({ description: "Rounded percentage of report revenue.", example: 45 })
  percentage!: number;
  @ApiProperty({ description: "Rounded revenue for this method.", example: 125000 })
  amount!: number;
}

export class SalesReportDto {
  @ApiProperty({ description: "Revenue and order count grouped by date.", type: [DailySaleDto] })
  dailySales!: DailySaleDto[];
  @ApiProperty({ description: "Up to eight products ordered by revenue.", type: [TopProductDto] })
  topProducts!: TopProductDto[];
  @ApiProperty({ description: "Payment-method revenue split.", type: [ReportPaymentDto] })
  paymentBreakdown!: ReportPaymentDto[];
  @ApiProperty({ description: "Rounded report-period revenue.", example: 975000 })
  totalSales!: number;
  @ApiProperty({ description: "Report-period order count.", example: 122 })
  totalOrders!: number;
  @ApiProperty({ description: "Unique non-empty customer names.", example: 74 })
  activeCustomers!: number;
  @ApiProperty({ description: "Applied branch scope, or null for all branches.", example: null, format: "uuid", nullable: true })
  branchId!: string | null;
}

export class SalesChartPointDto {
  @ApiProperty({ description: "Abbreviated calendar month.", example: "Jul" })
  month!: string;
  @ApiProperty({ description: "Rounded monthly revenue.", example: 975000 })
  revenue!: number;
}

export class WeeklyCategorySaleDto {
  @ApiProperty({ description: "Abbreviated weekday, Monday first.", example: "Mon" })
  day!: string;
  @ApiProperty({ description: "Rounded prescription-item revenue.", example: 42000 })
  prescription!: number;
  @ApiProperty({ description: "Rounded non-prescription-item revenue.", example: 31000 })
  otc!: number;
}

export class CategorySaleDto {
  @ApiProperty({ description: "Medication category key.", example: "prescription" })
  category!: string;
  @ApiProperty({ description: "Rounded category revenue.", example: 252000 })
  sales!: number;
  @ApiProperty({ description: "CSS chart color variable.", example: "var(--color-prescription)" })
  fill!: string;
}

export class CombinedSalesResponseDto {
  @ApiProperty({ description: "Thirty-day sales report.", type: SalesReportDto })
  salesReport!: SalesReportDto;
  @ApiProperty({ description: "Revenue grouped by month across the last six approximate months.", type: [SalesChartPointDto] })
  salesChart!: SalesChartPointDto[];
  @ApiProperty({ description: "Seven-day item revenue grouped by weekday and prescription class.", type: [WeeklyCategorySaleDto] })
  weeklySales!: WeeklyCategorySaleDto[];
  @ApiProperty({ description: "All-time item revenue grouped by medication category.", type: [CategorySaleDto] })
  categorySales!: CategorySaleDto[];
}

export class WeeklySalesPointDto {
  @ApiProperty({ description: "Abbreviated weekday, Sunday first.", example: "Sun" })
  day!: string;
  @ApiProperty({ description: "Rounded revenue during the last seven days.", example: 52000 })
  sales!: number;
}

export class AnalyticsPaymentDto {
  @ApiProperty({ description: "Stored payment method key.", example: "cash" })
  method!: string;
  @ApiProperty({ description: "Rounded share of thirty-day revenue.", example: 45 })
  percentage!: number;
}

export class HourlySalesPointDto {
  @ApiProperty({ description: "Hour label.", example: "2PM" })
  hour!: string;
  @ApiProperty({ description: "Rounded revenue in that hour today.", example: 18000 })
  sales!: number;
}

export class MonthlyComparisonPointDto {
  @ApiProperty({ description: "Ordinal week label.", example: "Week 1" })
  week!: string;
  @ApiProperty({ description: "Rounded current-month revenue.", example: 220000 })
  current!: number;
  @ApiProperty({ description: "Rounded previous-month revenue.", example: 195000 })
  previous!: number;
}

export class CustomerDistributionPointDto {
  @ApiProperty({ description: "Customer segment label.", example: "Walk-in" })
  name!: string;
  @ApiProperty({ description: "Rounded percentage of thirty-day sales.", example: 55 })
  value!: number;
  @ApiProperty({ description: "Brand chart color.", example: "#8fb3cc" })
  fill!: string;
}

export class TopCategoryDto {
  @ApiProperty({ description: "Capitalized medication category.", example: "Prescription" })
  name!: string;
  @ApiProperty({ description: "Rounded percentage of thirty-day item revenue.", example: 62 })
  value!: number;
  @ApiProperty({ description: "Tailwind background color class.", example: "bg-red-500" })
  color!: string;
}

export class SalesAnalyticsResponseDto {
  @ApiProperty({ description: "Seven-day revenue grouped by weekday.", type: [WeeklySalesPointDto] })
  weeklySales!: WeeklySalesPointDto[];
  @ApiProperty({ description: "Thirty-day payment-method distribution.", type: [AnalyticsPaymentDto] })
  paymentBreakdown!: AnalyticsPaymentDto[];
  @ApiProperty({ description: "Today revenue for the latest eight clock-hour labels.", type: [HourlySalesPointDto] })
  hourlySales!: HourlySalesPointDto[];
  @ApiProperty({ description: "Current and previous month revenue for weeks one through four.", type: [MonthlyComparisonPointDto] })
  monthlyComparison!: MonthlyComparisonPointDto[];
  @ApiProperty({ description: "Thirty-day customer segment percentages.", type: [CustomerDistributionPointDto] })
  customerDistribution!: CustomerDistributionPointDto[];
  @ApiProperty({ description: "Up to twenty categories ranked by thirty-day item revenue share.", type: [TopCategoryDto] })
  topCategories!: TopCategoryDto[];
}
