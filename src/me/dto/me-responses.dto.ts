import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SuccessResponseDto } from "../../common/dto";

export class ContextUserDto {
  @ApiProperty({ description: "Authenticated user identifier.", example: "a8203177-f7c9-4b11-a54f-454b7d33033f", format: "uuid" }) id!: string;
  @ApiProperty({ description: "User email address.", example: "aline@example.rw", format: "email", nullable: true }) email!: string | null;
  @ApiProperty({ description: "User full name.", example: "Aline Uwase", nullable: true }) fullName!: string | null;
  @ApiProperty({ description: "Whether the user is a platform administrator.", example: false }) isPlatformAdmin!: boolean;
}
export class MembershipDto {
  @ApiProperty({ description: "Pharmacy identifier.", example: "ef829450-3a46-4553-a319-253b194e9b2e", format: "uuid" }) pharmacyId!: string;
  @ApiProperty({ description: "Pharmacy name.", example: "Pryrox Central Pharmacy", nullable: true }) pharmacyName!: string | null;
  @ApiProperty({ description: "Membership role.", example: "pharmacist" }) role!: string;
  @ApiProperty({ description: "Whether this pharmacy is active.", example: true }) isActive!: boolean;
}
export class MeContextResponseDto {
  @ApiProperty({ description: "Authenticated user identity.", type: ContextUserDto }) user!: ContextUserDto;
  @ApiProperty({ description: "Selected pharmacy identifier.", example: "ef829450-3a46-4553-a319-253b194e9b2e", format: "uuid", nullable: true }) activePharmacyId!: string | null;
  @ApiProperty({ description: "Selected branch identifier.", example: "cd7a2193-7f09-45bc-b292-900572279c65", format: "uuid", nullable: true }) activeBranchId!: string | null;
  @ApiProperty({ description: "Role in the active pharmacy.", example: "pharmacist", nullable: true }) role!: string | null;
  @ApiProperty({ description: "Permitted branch identifiers; null means unrestricted.", example: ["cd7a2193-7f09-45bc-b292-900572279c65"], isArray: true, nullable: true }) allowedBranchIds!: string[] | null;
  @ApiProperty({ description: "Effective permission keys.", example: ["workspace.home", "inventory.access"], isArray: true }) permissions!: string[];
  @ApiProperty({ description: "Whether a password change is required.", example: false }) mustChangePassword!: boolean;
  @ApiProperty({ description: "User pharmacy memberships.", type: MembershipDto, isArray: true }) memberships!: MembershipDto[];
}
export class ContextSwitchResponseDto {
  @ApiProperty({ description: "Whether the context switch succeeded.", example: true }) success!: boolean;
  @ApiProperty({ description: "New active pharmacy identifier.", example: "ef829450-3a46-4553-a319-253b194e9b2e", format: "uuid", nullable: true }) activePharmacyId!: string | null;
  @ApiProperty({ description: "New active branch identifier.", example: "cd7a2193-7f09-45bc-b292-900572279c65", format: "uuid", nullable: true }) activeBranchId!: string | null;
  @ApiProperty({ description: "Role in the active pharmacy.", example: "pharmacist", nullable: true }) role!: string | null;
}
export class WorkplacePharmacyDto {
  @ApiProperty({ description: "Pharmacy identifier.", example: "ef829450-3a46-4553-a319-253b194e9b2e", format: "uuid" }) id!: string;
  @ApiProperty({ description: "Pharmacy name.", example: "Pryrox Central Pharmacy" }) name!: string;
  @ApiProperty({ description: "Pharmacy license number.", example: "PH-RW-2048", nullable: true }) licenseNumber!: string | null;
  @ApiProperty({ description: "Formatted pharmacy location.", example: "Kigali, Kigali City" }) location!: string;
  @ApiProperty({ description: "Pharmacy phone number.", example: "+250788111222", nullable: true }) phone!: string | null;
  @ApiProperty({ description: "Pharmacy business email.", example: "central@pryrox.rw", format: "email", nullable: true }) businessEmail!: string | null;
}
export class WorkplaceMembershipDto {
  @ApiProperty({ description: "Membership role.", example: "pharmacist", nullable: true }) role!: string | null;
  @ApiProperty({ description: "Human-readable role label.", example: "Pharmacist" }) roleLabel!: string;
}
export class WorkplaceBranchDto {
  @ApiProperty({ description: "Branch identifier.", example: "cd7a2193-7f09-45bc-b292-900572279c65", format: "uuid" }) id!: string;
  @ApiProperty({ description: "Branch name.", example: "Kigali Central" }) name!: string;
  @ApiPropertyOptional({ description: "Branch address.", example: "KN 4 Ave, Kigali", nullable: true }) city?: string | null;
  @ApiProperty({ description: "Whether this is the main branch.", example: true }) isMain!: boolean;
}
export class BranchAccessDto {
  @ApiProperty({ description: "Whether branch access is unrestricted.", example: false }) unrestricted!: boolean;
  @ApiProperty({ description: "Permitted branch identifiers; null means unrestricted.", example: ["cd7a2193-7f09-45bc-b292-900572279c65"], isArray: true, nullable: true }) allowedBranchIds!: string[] | null;
  @ApiProperty({ description: "Visible branches.", type: WorkplaceBranchDto, isArray: true }) branches!: WorkplaceBranchDto[];
  @ApiProperty({ description: "Current active branch.", type: WorkplaceBranchDto, nullable: true }) activeBranch!: WorkplaceBranchDto | null;
}
export class WorkplaceResponseDto {
  @ApiProperty({ description: "Active pharmacy details.", type: WorkplacePharmacyDto, nullable: true }) pharmacy!: WorkplacePharmacyDto | null;
  @ApiProperty({ description: "Active membership.", type: WorkplaceMembershipDto }) membership!: WorkplaceMembershipDto;
  @ApiProperty({ description: "Branch visibility and selection.", type: BranchAccessDto }) branchAccess!: BranchAccessDto;
}
export class DashboardMetricDto {
  @ApiProperty({ description: "Stable metric key.", example: "pending_prescriptions" }) key!: string;
  @ApiProperty({ description: "Human-readable metric label.", example: "Pending prescriptions" }) label!: string;
  @ApiProperty({ description: "Numeric or textual metric value.", example: 6, oneOf: [{ type: "number" }, { type: "string" }] }) value!: number | string;
  @ApiPropertyOptional({ description: "Optional supporting label or unit.", example: "Awaiting processing" }) hint?: string;
}
export class StaffDashboardResponseDto {
  @ApiProperty({ description: "Role in the active pharmacy.", example: "pharmacist", nullable: true }) role!: string | null;
  @ApiProperty({ description: "Role-aware dashboard metrics.", type: DashboardMetricDto, isArray: true }) metrics!: DashboardMetricDto[];
}
