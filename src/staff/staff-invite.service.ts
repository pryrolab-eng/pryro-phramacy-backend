import { Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { staffInviteEmailHtml, staffInviteEmailText } from "../mail/mail-templates";
import {
  buildStaffInviteApiPayload,
  generateTemporaryPassword,
  getAppUrl,
  roleLabel,
  StaffInviteEmailRejectedError,
  type StaffInviteEmailResult,
} from "./models";
import { StaffService } from "./staff.service";

const MUST_CHANGE_PASSWORD_METADATA_KEY = "must_change_password";

export type InvitePharmacyStaffInput = {
  pharmacyId: string;
  pharmacyName: string;
  email: string;
  fullName: string;
  phone?: string;
  role?: string;
  password?: string;
  invitedByUserId: string;
  auditMetadata?: { ipAddress?: string; userAgent?: string };
};

function isAuthDuplicateEmailError(error: unknown): boolean {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message).toLowerCase()
      : "";
  return (
    message.includes("already") ||
    message.includes("registered") ||
    message.includes("exists") ||
    message.includes("duplicate") ||
    message.includes("unique")
  );
}

@Injectable()
export class StaffInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  isSmtpConfigured(): boolean {
    return this.mail.isConfigured();
  }

  /** Applies an active platform email-template override before falling back to the built-in template. */
  private async resolveEmailTemplate(defaults: {
    templateKey: string;
    subject: string;
    html: string;
    text?: string;
    variables?: Record<string, string>;
  }): Promise<{ subject: string; html: string; text?: string }> {
    const variables = defaults.variables ?? {};
    const applyVariables = (value: string): string =>
      Object.entries(variables).reduce(
        (next, [key, replacement]) => next.replaceAll(`{{${key}}}`, replacement),
        value,
      );

    try {
      const override = await this.prisma.platform_email_templates.findUnique({
        where: { template_key: defaults.templateKey },
      });
      if (override?.is_active) {
        return {
          subject: applyVariables(override.subject),
          html: applyVariables(override.html),
          text: override.text ? applyVariables(override.text) : undefined,
        };
      }
    } catch (error) {
      console.error("resolveEmailTemplate:", error);
    }

    return {
      subject: applyVariables(defaults.subject),
      html: applyVariables(defaults.html),
      text: defaults.text ? applyVariables(defaults.text) : undefined,
    };
  }

  async sendStaffInviteEmail(options: {
    to: string;
    fullName: string;
    pharmacyName: string;
    role: string;
    temporaryPassword: string;
  }): Promise<StaffInviteEmailResult> {
    if (!this.mail.isConfigured()) {
      return {
        ok: false,
        skipped: true,
        error: "SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env to send invite emails.",
      };
    }

    const signInUrl = `${getAppUrl()}/sign-in`;
    const subject = `You're invited to join ${options.pharmacyName} on Pryrox`;

    const defaultHtml = staffInviteEmailHtml({
      fullName: options.fullName,
      pharmacyName: options.pharmacyName,
      role: options.role,
      signInUrl,
      temporaryPassword: options.temporaryPassword,
    });

    const defaultText = staffInviteEmailText({
      fullName: options.fullName,
      pharmacyName: options.pharmacyName,
      role: options.role,
      signInUrl,
      temporaryPassword: options.temporaryPassword,
    });

    try {
      const template = await this.resolveEmailTemplate({
        templateKey: "auth.staff_invite",
        subject,
        html: defaultHtml,
        text: defaultText,
        variables: {
          fullName: options.fullName,
          pharmacyName: options.pharmacyName,
          role: options.role === "pharmacist" ? "Pharmacist" : "Staff",
          roleLabel: roleLabel(options.role),
          signInUrl,
          temporaryPassword: options.temporaryPassword,
        },
      });

      await this.mail.sendMail({
        to: options.to,
        subject: template.subject,
        html: template.html,
        text: template.text ?? defaultText,
      });
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to send invite email";
      return { ok: false, error: message };
    }
  }

  /**
   * Staff invites must use a dedicated work email.
   * Pharmacy owner may use the same address for login and `pharmacies.email` at signup only.
   */
  async assertStaffInviteEmailAllowed(
    pharmacyId: string,
    rawEmail: string,
  ): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    if (!email) {
      throw new StaffInviteEmailRejectedError(
        "A valid email address is required for this team member.",
      );
    }

    const pharmacy = await this.prisma.pharmacies.findUnique({
      where: { id: pharmacyId },
      select: { owner_id: true, email: true },
    });

    const businessEmail = pharmacy?.email
      ? pharmacy.email.trim().toLowerCase()
      : null;

    let ownerAuthEmail: string | null = null;
    if (pharmacy?.owner_id) {
      const ownerAuth = await this.staff.getAuthUserById(pharmacy.owner_id);
      ownerAuthEmail = ownerAuth?.email
        ? ownerAuth.email.trim().toLowerCase()
        : null;
    }

    if (email === businessEmail || email === ownerAuthEmail) {
      throw new StaffInviteEmailRejectedError();
    }

    const existingUserId = await this.staff.findPublicUserIdByEmail(email);
    if (existingUserId) {
      throw new StaffInviteEmailRejectedError();
    }
  }

  private mapCreateUserErrorForStaffInvite(error: unknown): never {
    if (isAuthDuplicateEmailError(error)) {
      throw new StaffInviteEmailRejectedError();
    }
    throw error instanceof Error ? error : new Error("Failed to create team member");
  }

  async invitePharmacyStaffMember(input: InvitePharmacyStaffInput) {
    const email = input.email.trim().toLowerCase();
    const password =
      typeof input.password === "string" && input.password.trim().length >= 8
        ? input.password.trim()
        : generateTemporaryPassword();

    const fullName =
      input.fullName.trim() ||
      email.split("@")[0]?.replace(/[._]/g, " ") ||
      "Team member";

    const role = input.role?.trim() || "staff";
    const pharmacyName = input.pharmacyName.trim() || "your pharmacy";

    await this.assertStaffInviteEmailAllowed(input.pharmacyId, email);

    let authUser: { user: { id: string } };
    try {
      authUser = await this.staff.createAuthUser({
        email,
        password,
        fullName,
        userMetadata: {
          full_name: fullName,
          phone: input.phone ?? undefined,
          [MUST_CHANGE_PASSWORD_METADATA_KEY]: true,
        },
      });
    } catch (createUserError) {
      this.mapCreateUserErrorForStaffInvite(createUserError);
      throw createUserError;
    }

    if (!authUser?.user) {
      throw new Error("Failed to create team member");
    }

    await this.staff.createPharmacyMembership({
      pharmacyId: input.pharmacyId,
      userId: authUser.user.id,
      role,
    });

    await this.audit.writeAuditLog({
      pharmacyId: input.pharmacyId,
      userId: input.invitedByUserId,
      action: "INSERT",
      tableName: "pharmacy_users",
      recordId: authUser.user.id,
      newValues: {
        invitedUserId: authUser.user.id,
        email,
        fullName,
        role,
      },
      ...(input.auditMetadata ?? {}),
    });

    const emailResult = await this.sendStaffInviteEmail({
      to: email,
      fullName,
      pharmacyName,
      role,
      temporaryPassword: password,
    });

    return buildStaffInviteApiPayload({
      email,
      temporaryPassword: password,
      emailResult,
      userId: authUser.user.id,
      messageWhenEmailOk: "Team member created and invitation email sent",
      messageWhenEmailFailed:
        "Team member created; invitation email could not be sent",
    });
  }
}
