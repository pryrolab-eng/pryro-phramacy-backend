import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateAccountingExpenseDto {
  @ApiProperty({ description: "Expense category.", example: "Rent" })
  category!: string;

  @ApiProperty({ description: "Non-negative expense amount.", example: 150000 })
  amount!: number;

  @ApiPropertyOptional({ description: "Optional expense description.", example: "July premises rent", nullable: true })
  description?: string | null;

  @ApiPropertyOptional({ description: "Expense date. Defaults to today.", example: "2026-07-01", format: "date" })
  expenseDate?: string | null;
}

export class AccountingExpenseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;
  @ApiProperty({ example: "Rent" })
  category!: string;
  @ApiProperty({ example: 150000 })
  amount!: number;
  @ApiProperty({ nullable: true })
  description!: string | null;
  @ApiProperty({ format: "date-time" })
  expenseDate!: Date;
  @ApiProperty({ example: "manual" })
  source!: string;
}

export class AccountingExpensesResponseDto {
  @ApiProperty({ type: AccountingExpenseDto, isArray: true })
  expenses!: AccountingExpenseDto[];
}

export class CreateAccountingExpenseResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
  @ApiProperty({ type: AccountingExpenseDto })
  expense!: AccountingExpenseDto;
}

export class DeleteAccountingExpenseResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}

export class AccountingSummaryResponseDto {
  @ApiProperty({ example: 2500000 })
  revenue!: number;
  @ApiProperty({ example: 1700000 })
  expenses!: number;
  @ApiProperty({ example: 800000 })
  profit!: number;
  @ApiProperty({ example: 32 })
  profitMargin!: number;
  @ApiProperty({ type: "array", items: { type: "object" } })
  monthlyBreakdown!: Array<Record<string, unknown>>;
  @ApiProperty({ type: "array", items: { type: "object" } })
  expenseCategories!: Array<Record<string, unknown>>;
  @ApiProperty({ type: "object", additionalProperties: true })
  sources!: Record<string, unknown>;
  @ApiProperty({ type: "object", additionalProperties: true })
  paymentSummary!: Record<string, number>;
  @ApiProperty({ type: "object", additionalProperties: true })
  cashFlow!: Record<string, number>;
}
