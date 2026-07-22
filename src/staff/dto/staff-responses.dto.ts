import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const PHARMACY_USER_ID_EXAMPLE = "5f1c9f7e-42a9-4a91-b7d0-6cf62f5f9a44";
const BRANCH_ID_EXAMPLE = "8150740a-5ee8-4f92-8337-a72c7e390b9e";

export class StaffMemberDto {
  @ApiProperty({ description: "Pharmacy membership identifier (pharmacy_users row).", example: PHARMACY_USER_ID_EXAMPLE, format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Staff member's display name, falling back to the email local part or 'Unknown'.", example: "Jean Bosco Mugisha" })
  name!: string;

  @ApiProperty({ description: "Staff member's email address.", example: "jean.mugisha@example.com", nullable: true })
  email!: string | null;

  @ApiProperty({ description: "Staff member's phone. The current store always reports 'N/A'.", example: "N/A" })
  phone!: string;

  @ApiProperty({ description: "Pharmacy role of the staff member.", example: "pharmacist" })
  role!: string;

  @ApiProperty({ description: "Membership activity status.", example: "active", enum: ["active", "inactive"] })
  status!: "active" | "inactive";

  @ApiProperty({ description: "Locale-formatted membership creation date, or an empty string.", example: "7/21/2026" })
  joinDate!: string;
}

export class StaffCreationRejectedResponseDto {
  @ApiProperty({ description: "Always false; staff creation moved to another endpoint.", example: false })
  success!: boolean;

  @ApiProperty({ description: "Pointer to the supported staff creation endpoint.", example: "Use /api/pharmacist to create staff" })
  error!: string;
}

export class UpdateStaffResponseDto {
  @ApiProperty({ description: "Whether the staff member was updated. Update failures are reported with `success: false` and an `error` message in the same 200 response.", example: true })
  success!: boolean;

  @ApiPropertyOptional({ description: "Failure explanation when `success` is false.", example: "Failed to update password" })
  error?: string;
}

export class DeleteStaffResponseDto {
  @ApiProperty({ description: "Whether the staff member was deleted. Failures are reported with `success: false` and an `error` message in the same 200 response.", example: true })
  success!: boolean;

  @ApiPropertyOptional({ description: "Failure explanation when `success` is false.", example: "Failed to delete staff member" })
  error?: string;
}

export class StaffBranchAccessDto {
  @ApiProperty({ description: "Pharmacy membership identifier the access applies to.", example: PHARMACY_USER_ID_EXAMPLE, format: "uuid" })
  pharmacyUserId!: string;

  @ApiProperty({ description: "Branch UUIDs the staff member is restricted to.", type: [String], example: [BRANCH_ID_EXAMPLE] })
  branchIds!: string[];

  @ApiProperty({ description: "True when no branch restrictions exist (access to all branches).", example: false })
  unrestricted!: boolean;
}

export class UpdateStaffBranchesResponseDto {
  @ApiProperty({ description: "Whether the branch assignments were saved.", example: true })
  success!: boolean;

  @ApiProperty({ description: "Branch UUIDs now assigned to the staff member.", type: [String], example: [BRANCH_ID_EXAMPLE] })
  branchIds!: string[];

  @ApiProperty({ description: "True when the saved assignment list is empty (unrestricted access).", example: false })
  unrestricted!: boolean;
}

export class StaffInviteCredentialsDto {
  @ApiProperty({ description: "Email address of the invited account.", example: "jean.mugisha@example.com", format: "email" })
  email!: string;

  @ApiProperty({ description: "Temporary password to share manually when the invite email could not be sent.", example: "k3jf9XQ2!1" })
  temporaryPassword!: string;

  @ApiProperty({ description: "Sign-in page URL for the invited member.", example: "https://app.pryrox.com/sign-in" })
  signInUrl!: string;
}

export class ResendInviteResponseDto {
  @ApiProperty({ description: "Whether the password reset and invite processing completed.", example: true })
  success!: boolean;

  @ApiProperty({ description: "Human-readable outcome of the invite delivery.", example: "Login instructions were sent by email" })
  message!: string;

  @ApiPropertyOptional({ description: "Auth user identifier of the staff member.", example: "0b0dbe58-9a93-4f0c-8b48-8f2b1f0a6f77", format: "uuid" })
  userId?: string;

  @ApiProperty({ description: "Whether the invitation email was delivered.", example: true })
  emailSent!: boolean;

  @ApiPropertyOptional({ description: "Delivery failure reason when the email could not be sent.", example: "SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env to send invite emails." })
  emailError?: string;

  @ApiPropertyOptional({ description: "Manual sign-in credentials, present only when the email failed to send.", type: StaffInviteCredentialsDto })
  credentials?: StaffInviteCredentialsDto;
}

export class ImportStaffFailureDto {
  @ApiProperty({ description: "1-based spreadsheet row number (the first data row is row 2).", example: 4 })
  rowNumber!: number;

  @ApiProperty({ description: "Name or email identifying the failed row.", example: "Jean Bosco Mugisha" })
  label!: string;

  @ApiProperty({ description: "Failure reason for this row.", example: "This email can't be used for a team member. Ask them to sign in with a different work email." })
  error!: string;
}

export class ImportStaffResponseDto {
  @ApiProperty({ description: "True when every row imported successfully.", example: true })
  success!: boolean;

  @ApiProperty({ description: "Number of rows submitted for import.", example: 10 })
  attempted!: number;

  @ApiProperty({ description: "Number of rows imported successfully.", example: 9 })
  succeeded!: number;

  @ApiProperty({ description: "Per-row import failures.", type: [ImportStaffFailureDto] })
  failures!: ImportStaffFailureDto[];
}
