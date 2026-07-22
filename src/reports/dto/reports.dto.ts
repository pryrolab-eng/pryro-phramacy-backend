import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ReportScopeQueryDto {
  @ApiPropertyOptional({ description: "Branch UUID. Omit or use `all` for the permitted pharmacy-wide scope.", format: "uuid" })
  branchId?: string;
  @ApiPropertyOptional({ description: "Inclusive range start.", format: "date-time" })
  from?: string;
  @ApiPropertyOptional({ description: "Inclusive range end.", format: "date-time" })
  to?: string;
}

export class SalesReportResponseDto {
  @ApiProperty({ type: "array", items: { type: "object" } })
  dailySales!: Array<Record<string, unknown>>;
  @ApiProperty({ type: "array", items: { type: "object" } })
  topProducts!: Array<Record<string, unknown>>;
  @ApiProperty({ type: "array", items: { type: "object" } })
  paymentBreakdown!: Array<Record<string, unknown>>;
  @ApiProperty() totalSales!: number;
  @ApiProperty() totalOrders!: number;
  @ApiProperty() activeCustomers!: number;
  @ApiPropertyOptional({ nullable: true }) branchId?: string | null;
  @ApiPropertyOptional() error?: string;
}

export class InventoryReportResponseDto {
  @ApiProperty({ type: "array", items: { type: "object" } })
  inventoryAlerts!: Array<Record<string, unknown>>;
}

export class FinancialReportResponseDto {
  @ApiProperty() period!: string;
  @ApiProperty({ type: "object", additionalProperties: true }) revenue!: Record<string, number>;
  @ApiProperty({ type: "object", additionalProperties: true }) expenses!: Record<string, unknown>;
  @ApiProperty({ type: "object", additionalProperties: true }) profitLoss!: Record<string, number>;
  @ApiProperty({ type: "object", additionalProperties: true }) cashFlow!: Record<string, unknown>;
}

export class TaxReportResponseDto {
  @ApiProperty() period!: string;
  @ApiProperty({ type: "object", additionalProperties: true }) vatSummary!: Record<string, number>;
  @ApiProperty({ type: "array", items: { type: "object" } }) transactions!: Array<Record<string, unknown>>;
  @ApiProperty({ type: "object", additionalProperties: true }) rraSubmission!: Record<string, string>;
}

export class AuditReportItemDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() user!: string;
  @ApiProperty() action!: string;
  @ApiProperty() details!: string;
  @ApiProperty({ nullable: true, format: "date-time" }) timestamp!: string | null;
}

export class InsuranceClaimsReportResponseDto {
  @ApiProperty() month!: number;
  @ApiProperty() year!: number;
  @ApiProperty({ type: "object", additionalProperties: true }) period!: Record<string, string>;
  @ApiProperty({ type: "object", additionalProperties: true }) pharmacy!: Record<string, unknown>;
  @ApiProperty({ type: "array", items: { type: "object" } }) claims!: Array<Record<string, unknown>>;
  @ApiProperty({ type: "object", additionalProperties: true }) summary!: Record<string, unknown>;
  @ApiProperty({ nullable: true, type: "object", additionalProperties: true }) template!: Record<string, unknown> | null;
  @ApiProperty({ nullable: true }) renderedHtml!: string | null;
  @ApiProperty({ nullable: true }) renderedCss!: string | null;
}

export class CombinedReportsResponseDto {
  @ApiProperty({ type: "object", additionalProperties: true }) salesReport!: Record<string, unknown>;
  @ApiProperty({ type: "object", additionalProperties: true }) inventoryReport!: Record<string, unknown>;
  @ApiProperty({ type: "array", items: { type: "object" } }) categorySales!: Array<Record<string, unknown>>;
  @ApiProperty({ type: "object", additionalProperties: true }) dashboardStats!: Record<string, unknown>;
}
