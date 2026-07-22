import { ApiProperty } from "@nestjs/swagger";

export class SearchCustomerDto {
  @ApiProperty({ description: "Customer identifier.", example: "76994bcd-63d9-4f4c-b3f2-cf33fb04a410", format: "uuid" }) id!: string;
  @ApiProperty({ description: "Customer full name.", example: "Aline Uwase" }) name!: string;
  @ApiProperty({ description: "Customer phone number.", example: "+250788123456", nullable: true }) phone!: string | null;
}
export class SearchProductDto {
  @ApiProperty({ description: "Inventory or medication identifier.", example: "28ee8cbb-9bd7-4ec8-b860-bae5909ca0d7", format: "uuid" }) id!: string;
  @ApiProperty({ description: "Medication identifier.", example: "0ab224a2-e0ac-4c8e-a38c-681a82a046bf", format: "uuid" }) medicationId!: string;
  @ApiProperty({ description: "Medication name.", example: "Amoxicillin 500 mg" }) name!: string;
  @ApiProperty({ description: "Category or generic name.", example: "Antibiotics", nullable: true }) category!: string | null;
}
export class SearchPrescriptionDto {
  @ApiProperty({ description: "Prescription identifier.", example: "9b816fb4-264b-46e4-a5c3-e16ad74dc3d8", format: "uuid" }) id!: string;
  @ApiProperty({ description: "Patient name.", example: "Aline Uwase", nullable: true }) patient!: string | null;
  @ApiProperty({ description: "Prescribing doctor name.", example: "Dr. Mugisha", nullable: true }) doctor!: string | null;
  @ApiProperty({ description: "Prescription status.", example: "pending", nullable: true }) status!: string | null;
}
export class SearchSaleDto {
  @ApiProperty({ description: "Sale identifier.", example: "37820b94-2e6a-49c7-892c-b66d6cf4b61c", format: "uuid" }) id!: string;
  @ApiProperty({ description: "Receipt number.", example: "RCPT-2026-1042" }) receiptNumber!: string;
  @ApiProperty({ description: "Customer name.", example: "Aline Uwase" }) customerName!: string;
  @ApiProperty({ description: "Sale total.", example: 12500, format: "double" }) totalAmount!: number;
}
export class SearchStaffDto {
  @ApiProperty({ description: "Staff identifier.", example: "f20160d7-3e63-40ba-86f1-cc2a71447665", format: "uuid" }) id!: string;
  @ApiProperty({ description: "Combined first and last name.", example: "Jean Ndayisaba" }) name!: string;
  @ApiProperty({ description: "Staff email address.", example: "jean@example.rw", format: "email", nullable: true }) email!: string | null;
  @ApiProperty({ description: "Staff position.", example: "Pharmacist", nullable: true }) role!: string | null;
}
export class SearchBranchDto {
  @ApiProperty({ description: "Branch identifier.", example: "cd7a2193-7f09-45bc-b292-900572279c65", format: "uuid" }) id!: string;
  @ApiProperty({ description: "Branch name.", example: "Kigali Central" }) name!: string;
  @ApiProperty({ description: "Branch address.", example: "KN 4 Ave, Kigali", nullable: true }) city!: string | null;
  @ApiProperty({ description: "Branch activity status.", example: "active", enum: ["active", "inactive"] }) status!: string;
}
export class SearchResponseDto {
  @ApiProperty({ description: "Matching customers.", type: SearchCustomerDto, isArray: true }) customers!: SearchCustomerDto[];
  @ApiProperty({ description: "Matching products.", type: SearchProductDto, isArray: true }) products!: SearchProductDto[];
  @ApiProperty({ description: "Matching prescriptions.", type: SearchPrescriptionDto, isArray: true }) prescriptions!: SearchPrescriptionDto[];
  @ApiProperty({ description: "Matching completed sales.", type: SearchSaleDto, isArray: true }) sales!: SearchSaleDto[];
  @ApiProperty({ description: "Matching staff.", type: SearchStaffDto, isArray: true }) staff!: SearchStaffDto[];
  @ApiProperty({ description: "Matching branches.", type: SearchBranchDto, isArray: true }) branches!: SearchBranchDto[];
}
