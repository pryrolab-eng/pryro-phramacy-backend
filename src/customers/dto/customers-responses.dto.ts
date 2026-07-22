import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const CUSTOMER_ID_EXAMPLE = "3b5a6248-3e85-4b44-9f7f-9cd0a0da21c5";

export class CustomerDto {
  @ApiProperty({ description: "Customer identifier.", example: CUSTOMER_ID_EXAMPLE, format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Customer's full name.", example: "Aline Uwase" })
  name!: string;

  @ApiProperty({ description: "Customer phone number, or an empty string.", example: "+250788123456" })
  phone!: string;

  @ApiProperty({ description: "Customer email address, or an empty string.", example: "aline.uwase@example.com" })
  email!: string;

  @ApiProperty({ description: "Birth date in YYYY-MM-DD form, or an empty string.", example: "1992-08-17" })
  dateOfBirth!: string;

  @ApiProperty({ description: "Comma-separated allergies or 'None'.", example: "Penicillin, Aspirin" })
  allergies!: string;

  @ApiProperty({ description: "Insurance membership number, or an empty string.", example: "RSSB-2049381" })
  insurance!: string;

  @ApiProperty({ description: "Insurance membership number in legacy snake_case form.", example: "RSSB-2049381", nullable: true })
  insurance_number!: string | null;

  @ApiProperty({ description: "Total value of the customer's purchases.", example: 48500 })
  totalPurchases!: number;

  @ApiProperty({ description: "Customer creation date used as the last-visit date, or an empty string.", example: "2026-07-15" })
  lastVisit!: string;

  @ApiProperty({ description: "Customer activity status.", example: "active", enum: ["active", "inactive"] })
  status!: "active" | "inactive";
}

export class CustomerSearchResultDto {
  @ApiProperty({ description: "Customer identifier.", example: CUSTOMER_ID_EXAMPLE, format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Customer's full name.", example: "Aline Uwase" })
  name!: string;

  @ApiProperty({ description: "Customer phone number, or an empty string.", example: "+250788123456" })
  phone!: string;

  @ApiProperty({ description: "Insurance membership number in legacy snake_case form.", example: "RSSB-2049381", nullable: true })
  insurance_number!: string | null;
}

export class CombinedCustomerDto {
  @ApiProperty({ description: "Customer identifier.", example: CUSTOMER_ID_EXAMPLE, format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Customer's full name.", example: "Aline Uwase" })
  name!: string;

  @ApiProperty({ description: "Customer phone number, or an empty string.", example: "+250788123456" })
  phone!: string;

  @ApiPropertyOptional({ description: "Customer email when available.", example: "aline.uwase@example.com" })
  email?: string;

  @ApiPropertyOptional({ description: "Birth date in YYYY-MM-DD form when available.", example: "1992-08-17" })
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: "Comma-separated allergies when available.", example: "Penicillin" })
  allergies?: string;

  @ApiPropertyOptional({ description: "Insurance number when available.", example: "RSSB-2049381" })
  insurance?: string;

  @ApiPropertyOptional({ description: "Insurance number in legacy snake_case form when available.", example: "RSSB-2049381" })
  insurance_number?: string;

  @ApiProperty({ description: "Customer activity status.", example: "active", enum: ["active", "inactive"] })
  status!: "active" | "inactive";
}

export class CustomerStatsDto {
  @ApiProperty({ description: "Total customer count.", example: 128 })
  total!: number;

  @ApiProperty({ description: "Active customer count.", example: 119 })
  active!: number;

  @ApiProperty({ description: "Customers with an insurance number.", example: 76 })
  withInsurance!: number;

  @ApiProperty({ description: "Customers created during the current month.", example: 14 })
  newThisMonth!: number;
}

export class CombinedCustomersResponseDto {
  @ApiProperty({ description: "All pharmacy customers.", type: [CombinedCustomerDto] })
  customers!: CombinedCustomerDto[];

  @ApiProperty({ description: "Aggregate customer statistics.", type: CustomerStatsDto })
  stats!: CustomerStatsDto;

  @ApiProperty({ description: "At most ten most recently created customers.", type: [CombinedCustomerDto] })
  recent!: CombinedCustomerDto[];
}

export class CustomerSaleDto {
  @ApiProperty({ description: "Sale identifier.", example: "7530f89a-b923-4e5a-bc6c-ee9a60de05f8", format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Receipt number.", example: "RCP-2026-004821", nullable: true })
  receiptNumber!: string | null;

  @ApiProperty({ description: "Sale total.", example: 12500 })
  totalAmount!: number;

  @ApiProperty({ description: "Payment method.", example: "momo", nullable: true })
  paymentMethod!: string | null;

  @ApiProperty({ description: "Sale creation time.", example: "2026-07-20T14:25:18.000Z", format: "date-time", nullable: true })
  createdAt!: string | null;
}

export class CustomerHistoryResponseDto {
  @ApiProperty({ description: "Recent matching sales.", type: [CustomerSaleDto] })
  history!: CustomerSaleDto[];

  @ApiProperty({ description: "Legacy alias of `history` containing the same sales.", type: [CustomerSaleDto] })
  recentSales!: CustomerSaleDto[];
}

export class CreatedCustomerSummaryDto {
  @ApiProperty({ description: "Customer identifier.", example: CUSTOMER_ID_EXAMPLE, format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Customer's full name.", example: "Aline Uwase" })
  name!: string;

  @ApiProperty({ description: "Customer phone number.", example: "+250788123456", nullable: true })
  phone!: string | null;

  @ApiProperty({ description: "Insurance membership number in legacy snake_case form.", example: "RSSB-2049381", nullable: true })
  insurance_number!: string | null;
}

export class CreateCustomerResponseDto {
  @ApiProperty({ description: "Whether the customer was created.", example: true })
  success!: boolean;

  @ApiPropertyOptional({ description: "Created customer summary.", type: CreatedCustomerSummaryDto })
  customer?: CreatedCustomerSummaryDto;

  @ApiPropertyOptional({ description: "Success message.", example: "Customer added to database successfully" })
  message?: string;

  @ApiPropertyOptional({ description: "Failure message when creation fails.", example: "Failed to add customer" })
  error?: string;
}

export class ImportRowFailureDto {
  @ApiProperty({ description: "Spreadsheet-style row number.", example: 3 })
  rowNumber!: number;

  @ApiProperty({ description: "Customer name or fallback row label.", example: "Aline Uwase" })
  label!: string;

  @ApiProperty({ description: "Row failure detail.", example: "Invalid date of birth" })
  error!: string;
}

export class ImportCustomersResponseDto {
  @ApiProperty({ description: "True only when every row succeeded.", example: true })
  success!: boolean;

  @ApiPropertyOptional({ description: "Number of rows processed.", example: 1 })
  attempted?: number;

  @ApiPropertyOptional({ description: "Number of rows created.", example: 1 })
  succeeded?: number;

  @ApiPropertyOptional({ description: "Rows that could not be created.", type: [ImportRowFailureDto] })
  failures?: ImportRowFailureDto[];

  @ApiPropertyOptional({ description: "Batch-level failure message.", example: "No rows to import" })
  error?: string;

  @ApiPropertyOptional({ description: "Unexpected batch error detail.", example: "Database connection unavailable" })
  details?: string;
}

export class LoyaltyRecordDto {
  @ApiProperty({ description: "Loyalty record identifier.", example: "18074c93-55ab-403c-b6b1-fb4e7413db8e", format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Associated customer identifier.", example: CUSTOMER_ID_EXAMPLE, format: "uuid", nullable: true })
  customerId!: string | null;

  @ApiProperty({ description: "Customer name, or `Unknown` when unavailable.", example: "Aline Uwase" })
  name!: string;

  @ApiProperty({ description: "Current loyalty points.", example: 540, nullable: true })
  points!: number | null;

  @ApiProperty({ description: "Current loyalty tier.", example: "Gold", enum: ["Bronze", "Silver", "Gold"], nullable: true })
  tier!: string | null;

  @ApiProperty({ description: "Database decimal representing lifetime loyalty spend.", example: "48500.00", nullable: true })
  totalSpent!: string | null;
}

export class StoredLoyaltyRecordDto {
  @ApiProperty({ description: "Loyalty record identifier.", example: "18074c93-55ab-403c-b6b1-fb4e7413db8e", format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Owning pharmacy identifier.", example: "a30ea6f1-2be8-4cb6-81df-cbf4e6546ff2", format: "uuid", nullable: true })
  pharmacy_id!: string | null;

  @ApiProperty({ description: "Customer identifier.", example: CUSTOMER_ID_EXAMPLE, format: "uuid", nullable: true })
  customer_id!: string | null;

  @ApiProperty({ description: "Updated points.", example: 590, nullable: true })
  points!: number | null;

  @ApiProperty({ description: "Updated tier.", example: "Gold", enum: ["Bronze", "Silver", "Gold"], nullable: true })
  tier!: string | null;

  @ApiProperty({ description: "Lifetime spend decimal.", example: "48500.00", nullable: true })
  total_spent!: string | null;

  @ApiProperty({ description: "Record creation time.", example: "2026-02-03T08:00:00.000Z", format: "date-time", nullable: true })
  created_at!: string | null;

  @ApiProperty({ description: "Record update time.", example: "2026-07-21T11:20:00.000Z", format: "date-time", nullable: true })
  updated_at!: string | null;
}

export class AdjustLoyaltyResponseDto {
  @ApiProperty({ description: "Whether the update succeeded.", example: true })
  success!: boolean;

  @ApiProperty({ description: "Updated loyalty record.", type: StoredLoyaltyRecordDto })
  customer!: StoredLoyaltyRecordDto;
}

export class CustomerDetailResponseDto {
  @ApiProperty({ description: "Formatted customer with purchase totals.", type: CustomerDto })
  customer!: CustomerDto;

  @ApiProperty({ description: "Up to twenty recent sales for the customer.", type: [CustomerSaleDto] })
  recentSales!: CustomerSaleDto[];
}

export class UpdateCustomerResponseDto {
  @ApiProperty({ description: "Whether the update succeeded.", example: true })
  success!: boolean;

  @ApiProperty({ description: "Updated formatted customer.", type: CustomerDto })
  customer!: CustomerDto;
}

export class DeleteCustomerResponseDto {
  @ApiProperty({ description: "Whether the delete operation completed.", example: true })
  success!: boolean;
}
