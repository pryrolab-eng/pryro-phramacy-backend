import type { StaffInviteEmailResult } from "./staff.types";

/** Pryrox brand accent used across transactional emails. */
const BRAND = "#003459";
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** Fallback when `supportEmail` is not set in platform settings. */
const DEFAULT_PLATFORM_SUPPORT_EMAIL = "support@pryrox.com";

const HELP_GETTING_STARTED_ROUTE = "/pharmacy/help/getting-started";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Canonical app origin (no trailing slash).
 * Priority: NEXT_PUBLIC_APP_URL → NEXT_PUBLIC_BASE_URL → VERCEL_URL → localhost.
 */
export function getAppUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}

/** Sign-in page URL; relative path only when no origin can be resolved. */
export function getSignInUrl(): string {
  const base = getAppUrl();
  if (base === "http://localhost:3000" && !process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    return "/sign-in";
  }
  return `${base}/sign-in`;
}

function normalizeSupportEmail(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_PLATFORM_SUPPORT_EMAIL;
  const trimmed = value.trim();
  if (!trimmed || !trimmed.includes("@")) return DEFAULT_PLATFORM_SUPPORT_EMAIL;
  return trimmed;
}

function buildSupportMailto(email: string, subject: string): string {
  return `mailto:${normalizeSupportEmail(email)}?subject=${encodeURIComponent(subject)}`;
}

export function roleLabel(role: string): string {
  if (role === "pharmacist") return "Pharmacist";
  if (role === "cashier") return "Cashier";
  if (role === "owner") return "Owner";
  if (role === "manager") return "Manager";
  return "Staff member";
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

type InvitationEmailOptions = {
  preheader: string;
  greeting: string;
  introHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  extraBodyHtml?: string;
  fallbackUrl?: string;
};

function emailBrandHeader(): string {
  const appUrl = escapeHtml(getAppUrl());
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:0 0 28px;">
        <a href="${appUrl}" style="text-decoration:none;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
            <tr>
              <td style="vertical-align:middle;padding-right:10px;">
                <span style="display:inline-block;width:28px;height:28px;background-color:${BRAND};border-radius:6px;line-height:28px;text-align:center;color:#ffffff;font-size:14px;font-weight:700;">P</span>
              </td>
              <td style="vertical-align:middle;font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;">Pryrox</td>
            </tr>
          </table>
        </a>
      </td>
    </tr>
  </table>`;
}

function emailPrimaryButton(label: string, href: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 24px;">
    <tr>
      <td align="center">
        <a href="${escapeHtml(href)}" style="display:inline-block;background-color:${BRAND};color:#ffffff;font-size:16px;font-weight:600;line-height:1;text-decoration:none;padding:14px 32px;border-radius:6px;mso-padding-alt:0;min-width:200px;text-align:center;">
          <!--[if mso]><i style="letter-spacing:32px;mso-font-width:-100%;mso-text-raise:30pt">&nbsp;</i><![endif]-->
          <span style="mso-text-raise:15pt;">${escapeHtml(label)}</span>
          <!--[if mso]><i style="letter-spacing:32px;mso-font-width:-100%">&nbsp;</i><![endif]-->
        </a>
      </td>
    </tr>
  </table>`;
}

function emailTroubleshootSection(url: string): string {
  const safeUrl = escapeHtml(url);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border-top:1px solid #e5e7eb;">
    <tr>
      <td style="padding:24px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
        <p style="margin:0 0 12px;">If you&rsquo;re having trouble with the button above, copy and paste the URL below into your web browser.</p>
        <p style="margin:0;word-break:break-all;">
          <a href="${safeUrl}" style="color:${BRAND};text-decoration:underline;">${safeUrl}</a>
        </p>
      </td>
    </tr>
  </table>`;
}

function emailFooter(): string {
  const year = new Date().getFullYear();
  const appUrl = escapeHtml(getAppUrl());
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px 0;font-size:12px;line-height:1.6;color:#9ca3af;">
        <p style="margin:0 0 4px;">&copy; ${year} Pryrox. All rights reserved.</p>
        <p style="margin:0;">
          <a href="${appUrl}" style="color:#9ca3af;text-decoration:underline;">${appUrl.replace(/^https?:\/\//, "")}</a>
        </p>
      </td>
    </tr>
  </table>`;
}

/** SaaS-style invitation email shell (centered card + CTA + troubleshoot footer). */
function invitationEmailHtml(options: InvitationEmailOptions): string {
  const preheader = escapeHtml(options.preheader);
  const greeting = escapeHtml(options.greeting);
  const fallbackUrl = options.fallbackUrl ?? options.ctaUrl;

  const defaultSupport = `If you have any questions, reply to your pharmacy manager or
    <a href="${escapeHtml(buildSupportMailto(DEFAULT_PLATFORM_SUPPORT_EMAIL, "Pryrox support"))}" style="color:${BRAND};text-decoration:underline;">contact our support team</a>.`;

  const defaultSignOff = `Welcome aboard,<br /><strong style="color:#111827;">The Pryrox Team</strong>`;

  const helpUrl = escapeHtml(`${getAppUrl()}${HELP_GETTING_STARTED_ROUTE}`);
  const defaultPostscript = `P.S. Need help getting started? Check out our
    <a href="${helpUrl}" style="color:${BRAND};text-decoration:underline;">help documentation</a>.`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light" />
  <title>Invitation</title>
  <style>
    @media only screen and (max-width: 620px) {
      .invite-card { padding: 32px 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr><td>${emailBrandHeader()}</td></tr>
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
                <tr>
                  <td class="invite-card" style="padding:40px 48px;">
                    <h1 style="margin:0 0 24px;font-size:26px;line-height:1.25;font-weight:700;color:#111827;">${greeting}</h1>
                    <div style="font-size:16px;line-height:1.65;color:#374151;">
                      ${options.introHtml}
                    </div>
                    ${emailPrimaryButton(options.ctaLabel, options.ctaUrl)}
                    ${options.extraBodyHtml ?? ""}
                    <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#4b5563;">
                      ${defaultSupport}
                    </p>
                    <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#374151;">
                      ${defaultSignOff}
                    </p>
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;font-style:italic;">
                      ${defaultPostscript}
                    </p>
                    ${emailTroubleshootSection(fallbackUrl)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td>${emailFooter()}</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function invitationCredentialsBlock(options: {
  signInUrl: string;
  temporaryPassword: string;
}): string {
  const safeUrl = escapeHtml(options.signInUrl);
  const safePassword = escapeHtml(options.temporaryPassword);

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;">
    <tr>
      <td style="padding:20px 22px;">
        <p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:#374151;">
          Use these credentials for your first sign-in. You&rsquo;ll be asked to change your password afterward.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:0 0 10px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Sign-in URL</td>
          </tr>
          <tr>
            <td style="padding:0 0 16px;font-size:14px;line-height:1.5;word-break:break-all;">
              <a href="${safeUrl}" style="color:${BRAND};text-decoration:underline;">${safeUrl}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 6px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Temporary password</td>
          </tr>
          <tr>
            <td style="padding:0;">
              <code style="display:inline-block;font-size:17px;font-weight:700;font-family:ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:0.08em;color:#111827;background:#ffffff;border:1px dashed #d1d5db;border-radius:4px;padding:8px 12px;">${safePassword}</code>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

export function staffInviteEmailHtml(options: {
  fullName: string;
  pharmacyName: string;
  role: string;
  signInUrl: string;
  temporaryPassword: string;
}): string {
  const { fullName, pharmacyName, role, signInUrl, temporaryPassword } = options;
  const label = roleLabel(role);
  const name = escapeHtml(firstName(fullName));
  const org = escapeHtml(pharmacyName);

  return invitationEmailHtml({
    preheader: `${pharmacyName} invited you to join their team on Pryrox as ${label}.`,
    greeting: `Hi, ${name}!`,
    introHtml: `<p style="margin:0 0 16px;">
        <strong style="color:#111827;">${org}</strong> has invited you to use
        <strong style="color:#111827;">Pryrox</strong> to work with their pharmacy team as a
        <strong style="color:#111827;">${escapeHtml(label)}</strong>.
        Click the button below to sign in and set up your account.
      </p>`,
    ctaLabel: "Set up your account",
    ctaUrl: signInUrl,
    extraBodyHtml: invitationCredentialsBlock({ signInUrl, temporaryPassword }),
    fallbackUrl: signInUrl,
  });
}

export function staffInviteEmailText(options: {
  fullName: string;
  pharmacyName: string;
  role: string;
  signInUrl: string;
  temporaryPassword: string;
}): string {
  const label = roleLabel(options.role);
  const name = firstName(options.fullName);
  const helpUrl = `${getAppUrl()}${HELP_GETTING_STARTED_ROUTE}`;
  const supportMailto = buildSupportMailto(
    DEFAULT_PLATFORM_SUPPORT_EMAIL,
    "Pryrox support",
  );

  return [
    `Hi, ${name}!`,
    ``,
    `${options.pharmacyName} has invited you to use Pryrox to work with their pharmacy team as a ${label}.`,
    ``,
    `Set up your account: ${options.signInUrl}`,
    ``,
    `Sign-in URL: ${options.signInUrl}`,
    `Temporary password: ${options.temporaryPassword}`,
    ``,
    `Change your password after your first sign-in.`,
    ``,
    `If you have questions, contact your pharmacy manager or ${supportMailto}.`,
    ``,
    `Welcome aboard,`,
    `The Pryrox Team`,
    ``,
    `P.S. Need help getting started? ${helpUrl}`,
    ``,
    `If the link above doesn't work, copy and paste this URL into your browser:`,
    options.signInUrl,
    ``,
    `© ${new Date().getFullYear()} Pryrox. All rights reserved.`,
  ].join("\n");
}

export function buildStaffInviteApiPayload(options: {
  email: string;
  temporaryPassword: string;
  emailResult: StaffInviteEmailResult;
  userId?: string;
  messageWhenEmailOk: string;
  messageWhenEmailFailed: string;
}) {
  const { email, temporaryPassword, emailResult } = options;
  return {
    success: true as const,
    message: emailResult.ok
      ? options.messageWhenEmailOk
      : options.messageWhenEmailFailed,
    userId: options.userId,
    emailSent: emailResult.ok,
    emailError: emailResult.ok ? undefined : emailResult.error,
    ...(emailResult.ok
      ? {}
      : {
          credentials: {
            email,
            temporaryPassword,
            signInUrl: getSignInUrl(),
          },
        }),
  };
}
