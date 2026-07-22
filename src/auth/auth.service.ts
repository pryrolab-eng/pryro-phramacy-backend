import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import * as bcrypt from "bcryptjs";
import otplib from "otplib";
import crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AppConfigService } from "../config/app-config.service";
import type { AuthUser } from "./auth.types";
import { SessionTokenService } from "./session-token.service";
import { AuditService } from "../audit/audit.service";
import { AuthTokensService } from "./auth-tokens.service";
import { MailService } from "../mail/mail.service";
import {
  recoveryEmailHtml,
  confirmationEmailHtml,
  emailChangeVerificationHtml,
  emailChangeNotificationHtml,
} from "../mail/mail-templates";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionTokens: SessionTokenService,
    private readonly appConfig: AppConfigService,
    private readonly audit: AuditService,
    private readonly authTokens: AuthTokensService,
    private readonly mail: MailService,
  ) {}

  // --- Session resolution (existing) ---

  extractSessionJwt(request: Request): string | null {
    const cookieName = this.appConfig.sessionCookieName;
    const value = request.cookies?.[cookieName];
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  async resolveUserFromRequest(request: Request): Promise<AuthUser | null> {
    if (!this.appConfig.nativeAuthEnabled) return null;
    const accessJwt = this.extractSessionJwt(request);
    if (!accessJwt) return null;
    const payload = await this.sessionTokens.verifyAccessToken(accessJwt);
    if (!payload) return null;
    return this.findUserById(payload.sub);
  }

  async requireUserFromRequest(request: Request): Promise<AuthUser> {
    const user = await this.resolveUserFromRequest(request);
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private async findUserById(userId: string): Promise<AuthUser | null> {
    const row = await this.prisma.auth_users.findUnique({
      where: { id: userId },
      select: { id: true, email: true, raw_user_meta_data: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      user_metadata: (row.raw_user_meta_data as Record<string, unknown> | null) ?? undefined,
    };
  }

  // --- Bootstrap ---

  async bootstrap(user: AuthUser) {
    const [profile, membership] = await Promise.all([
      this.prisma.public_users.findUnique({
        where: { id: user.id },
        select: { full_name: true, email: true, is_platform_admin: true, active_pharmacy_id: true },
      }),
      this.prisma.pharmacy_users.findFirst({
        where: { user_id: user.id, is_active: true },
        orderBy: { created_at: "desc" },
        select: { pharmacy_id: true, role: true, pharmacies: { select: { name: true } } },
      }),
    ]);

    const isPlatformAdmin = profile?.is_platform_admin === true;
    const mustChangePassword = await this.readMustChangePassword(user.id);

    let path = "/onboarding";
    if (isPlatformAdmin || membership?.role === "admin") {
      path = "/admin";
    } else if (membership?.pharmacy_id) {
      const staffRoles = ["cashier", "pharmacist", "technician", "intern"];
      path = staffRoles.includes(membership.role ?? "") ? "/pharmacy/staff" : "/pharmacy/dashboard";
    } else {
      const owned = await this.prisma.pharmacies.findFirst({
        where: { owner_id: user.id },
        select: { id: true },
      });
      if (owned?.id) {
        await this.ensureMembership(owned.id, user.id, "pharmacy_owner");
        path = "/pharmacy/dashboard";
      }
    }

    const allMemberships = await this.prisma.pharmacy_users.findMany({
      where: { user_id: user.id, is_active: true },
      select: { pharmacy_id: true, role: true, pharmacies: { select: { name: true } } },
    });

    const me = {
      user: {
        id: user.id,
        email: user.email ?? profile?.email ?? null,
        fullName: profile?.full_name ?? null,
        isPlatformAdmin,
      },
      activePharmacyId: profile?.active_pharmacy_id ?? membership?.pharmacy_id ?? null,
      activeBranchId: null,
      role: membership?.role ?? null,
      allowedBranchIds: null,
      permissions: [],
      mustChangePassword,
      memberships: allMemberships
        .filter((m): m is typeof m & { pharmacy_id: string } => Boolean(m.pharmacy_id))
        .map((m) => ({
          pharmacyId: m.pharmacy_id,
          pharmacyName: m.pharmacies?.name ?? null,
          role: m.role,
          isActive: m.pharmacy_id === (membership?.pharmacy_id ?? profile?.active_pharmacy_id),
        })),
    };

    return {
      ok: true,
      path,
      mustChangePassword,
      me,
      entitlements: null,
      dashboard: null,
      subscription: null,
      plans: null,
      staff: null,
    };
  }

  // --- Home ---

  async home(user: AuthUser) {
    const [isPlatformAdmin, membershipRows] = await Promise.all([
      this.prisma.public_users.findUnique({ where: { id: user.id }, select: { is_platform_admin: true } }),
      this.prisma.pharmacy_users.findMany({ where: { user_id: user.id, is_active: true }, select: { pharmacy_id: true, role: true } }),
    ]);

    const userPharmacy = this.selectPrimary(membershipRows);
    const isAdmin = isPlatformAdmin?.is_platform_admin === true || userPharmacy?.role === "admin";

    let path: string;
    if (isAdmin) {
      path = "/admin";
    } else if (!userPharmacy) {
      const owned = await this.prisma.pharmacies.findFirst({ where: { owner_id: user.id }, select: { id: true } });
      if (owned?.id) {
        await this.ensureMembership(owned.id, user.id, "pharmacy_owner");
        path = "/pharmacy/dashboard";
      } else {
        path = "/onboarding";
      }
    } else {
      const staffRoles = ["cashier", "pharmacist", "technician", "intern"];
      path = staffRoles.includes(userPharmacy.role ?? "") ? "/pharmacy/staff" : "/pharmacy/dashboard";
    }

    const mustChangePassword = await this.readMustChangePassword(user.id);
    return { ok: true, path, mustChangePassword };
  }

  // --- Change password ---

  async changePassword(user: AuthUser, input: { newPassword: string; confirmPassword: string; currentPassword?: string }) {
    if (!input.newPassword || !input.confirmPassword) {
      throw { status: 400, error: "Enter and confirm your new password." };
    }
    if (input.newPassword.length < 8) {
      throw { status: 400, error: "Password must be at least 8 characters." };
    }
    if (input.newPassword !== input.confirmPassword) {
      throw { status: 400, error: "Passwords do not match." };
    }

    const cred = await this.prisma.auth_users.findUnique({
      where: { id: user.id },
      select: { encrypted_password: true, raw_user_meta_data: true },
    });

    const meta = (cred?.raw_user_meta_data as Record<string, unknown>) ?? {};
    const forced = meta.must_change_password === true;

    if (!forced) {
      if (!input.currentPassword) {
        throw { status: 400, error: "Current password is required." };
      }
      const ok = await bcrypt.compare(input.currentPassword, cred?.encrypted_password ?? "");
      if (!ok) {
        throw { status: 401, error: "Current password is incorrect." };
      }
    }

    const hash = await bcrypt.hash(input.newPassword.trim(), 10);
    await this.prisma.auth_users.update({
      where: { id: user.id },
      data: {
        encrypted_password: hash,
        raw_user_meta_data: { ...meta, must_change_password: false } as never,
        updated_at: new Date(),
      },
    });

    await this.audit.writeAuditLog({
      pharmacyId: null, userId: user.id, action: "UPDATE", tableName: "auth.users", recordId: user.id,
      newValues: { securityEvent: forced ? "forced_password_changed" : "password_changed" },
    });

    return { success: true, mustChangePassword: false };
  }

  // --- Change email ---

  async changeEmail(user: AuthUser, newEmail: string) {
    const email = newEmail.trim().toLowerCase();

    const existing = await this.prisma.auth_users.findFirst({
      where: { email },
      select: { id: true },
    });
    if (existing && existing.id !== user.id) {
      return { success: true, message: "If this email is available, a verification link has been sent." };
    }

    const token = await this.authTokens.signEmailChangeToken(user.id, email);
    const appUrl = this.authTokens.getAppUrl();
    const verifyLink = `${appUrl}/api/auth/verify-email-change?token=${token}`;

    await this.prisma.auth_users.update({
      where: { id: user.id },
      data: {
        email_change: email,
        email_change_token_new: token,
        email_change_sent_at: new Date(),
        email_change_confirm_status: 0,
      },
    });

    await this.mail.sendMail({
      to: email,
      subject: "Confirm your new Pryrox email",
      html: emailChangeVerificationHtml(verifyLink),
      text: `Confirm your new Pryrox email: ${verifyLink}`,
    });

    if (user.email) {
      await this.mail.sendMail({
        to: user.email,
        subject: "Your Pryrox email is being changed",
        html: emailChangeNotificationHtml(email),
        text: `Your Pryrox account email is being changed to ${email}. If you did not request this, contact support immediately.`,
      });
    }

    await this.audit.writeAuditLog({
      pharmacyId: null, userId: user.id, action: "UPDATE", tableName: "auth.users", recordId: user.id,
      newValues: { emailChangeInitiated: true, newEmail: email },
    });

    return { success: true, message: "If this email is available, a verification link has been sent." };
  }

  async signIn(email: string, password: string): Promise<{
    success: boolean;
    needsTwoFactor?: boolean;
    sessionToken?: string;
    userId?: string;
    error?: string;
    unconfirmed?: boolean;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return { success: false, error: "Email and password are required." };
    }

    const row = await this.prisma.auth_users.findFirst({
      where: { email: normalizedEmail },
      select: { id: true, email: true, encrypted_password: true, email_confirmed_at: true },
    });

    if (!row || !row.encrypted_password) {
      return { success: false, error: "Invalid email or password." };
    }

    const valid = await bcrypt.compare(password, row.encrypted_password);
    if (!valid) {
      return { success: false, error: "Invalid email or password." };
    }

    if (!row.email_confirmed_at) {
      return {
        success: false,
        unconfirmed: true,
        error: "Please confirm your email before signing in. Use Resend email in this notification.",
      };
    }

    // Check if 2FA is required
    const [platformAllows2FA, userData] = await Promise.all([
      this.prisma.system_settings.findFirst({
        where: { pharmacy_id: null, setting_key: "allowUserTwoFactor" },
        select: { setting_value: true },
      }),
      this.prisma.public_users.findUnique({
        where: { id: row.id },
        select: { two_factor_enabled: true },
      }),
    ]);

    const twoFactorEnabled =
      (platformAllows2FA?.setting_value === true || platformAllows2FA?.setting_value === "true") &&
      userData?.two_factor_enabled === true;

    if (twoFactorEnabled) {
      const sessionToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await this.prisma.two_factor_sessions.create({
        data: { user_id: row.id, session_token: sessionToken, expires_at: expiresAt },
      });
      return { success: true, needsTwoFactor: true, sessionToken };
    }

    return { success: true, userId: row.id };
  }

  async verify2fa(input: { sessionToken: string; token: string }) {
    const session = await this.prisma.two_factor_sessions.findUnique({
      where: { session_token: input.sessionToken },
      select: { user_id: true, expires_at: true, verified: true },
    });

    if (!session || session.verified) {
      throw { status: 400, error: "Invalid or expired session" };
    }
    if (session.expires_at < new Date()) {
      throw { status: 400, error: "Session expired" };
    }

    const userData = await this.prisma.public_users.findUnique({
      where: { id: session.user_id },
      select: { two_factor_secret: true, two_factor_backup_codes: true },
    });
    if (!userData) throw { status: 400, error: "User not found" };

    let isValid = false;
    const codes = userData.two_factor_backup_codes as string[] | undefined;
    if (codes?.includes(input.token)) {
      isValid = true;
      const updated = codes.filter((c) => c !== input.token);
      await this.prisma.public_users.update({
        where: { id: session.user_id },
        data: { two_factor_backup_codes: updated },
      });
    } else if (userData.two_factor_secret) {
      const result = await otplib.verify({ token: input.token, secret: userData.two_factor_secret });
      isValid = result !== null;
    }

    if (!isValid) throw { status: 400, error: "Invalid code" };

    await this.prisma.two_factor_sessions.update({
      where: { session_token: input.sessionToken },
      data: { verified: true },
    });

    return { success: true, userId: session.user_id };
  }

  // --- Recovery email ---

  async recoveryEmail(email: string) {
    const row = await this.prisma.auth_users.findFirst({
      where: { email: email.trim().toLowerCase() },
      select: { id: true },
    });

    if (!row) {
      return { success: true, provider: "nodemailer", message: "Check your email for a password reset link." };
    }

    const token = await this.authTokens.signPasswordResetToken(row.id);
    const appUrl = this.authTokens.getAppUrl();
    const resetUrl = `${appUrl}/auth/reset-password?native_token=${token}`;

    await this.mail.sendMail({
      to: email,
      subject: "Reset your Pryrox password",
      html: recoveryEmailHtml(resetUrl),
      text: `Reset your Pryrox password: ${resetUrl}`,
    });

    return { success: true, provider: "nodemailer", message: "Check your email for a password reset link." };
  }

  // --- Resend confirmation ---

  async resendConfirmation(email: string) {
    const row = await this.prisma.auth_users.findFirst({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, email: true, email_confirmed_at: true },
    });

    if (!row || row.email_confirmed_at) {
      return { success: true, message: "If an account exists for this email, we sent a new confirmation link.", provider: "nodemailer" };
    }

    const token = await this.authTokens.signEmailConfirmToken(row.id, row.email ?? email);
    const appUrl = this.authTokens.getAppUrl();
    const confirmUrl = `${appUrl}/api/auth/confirm-email?token=${token}&next=/onboarding`;

    await this.mail.sendMail({
      to: email,
      subject: "Confirm your Pryrox email",
      html: confirmationEmailHtml(confirmUrl),
      text: `Confirm your Pryrox email: ${confirmUrl}`,
    });

    return { success: true, message: "If an account exists for this email, we sent a new confirmation link.", provider: "nodemailer" };
  }

  // --- Private helpers ---

  private async readMustChangePassword(userId: string): Promise<boolean> {
    const row = await this.prisma.auth_users.findUnique({
      where: { id: userId },
      select: { raw_user_meta_data: true },
    });
    const meta = (row?.raw_user_meta_data as Record<string, unknown>) ?? {};
    return meta.must_change_password === true;
  }

  private selectPrimary(rows: Array<{ pharmacy_id: string | null; role: string | null }>) {
    if (rows.length === 0) return null;
    const preferred = rows.find((r) => r.role === "pharmacy_owner" || r.role === "admin");
    return preferred ?? rows[0];
  }

  private async ensureMembership(pharmacyId: string, userId: string, role: string) {
    const existing = await this.prisma.pharmacy_users.findFirst({
      where: { pharmacy_id: pharmacyId, user_id: userId },
    });
    if (existing) return;
    await this.prisma.pharmacy_users.create({
      data: { pharmacy_id: pharmacyId, user_id: userId, role: role as never, is_active: true },
    });
  }

  private async sendEmail(_input: unknown) {
    // Replaced by MailService injection — this stub prevents stale call-sites from crashing
  }
}
