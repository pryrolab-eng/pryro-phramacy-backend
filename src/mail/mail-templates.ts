// Branded transactional email templates — ported from frontend/src/lib/email/templates.ts
import {
  emailButton,
  emailFallbackLink,
  emailParagraph,
  escapeHtml,
  pryroxEmailLayout,
  emailCredentialsCard,
} from "./mail-layout";

export function confirmationEmailHtml(link: string): string {
  return pryroxEmailLayout({
    title: "Confirm your email",
    preheader: "One click to finish setting up your Pryrox account.",
    bodyHtml: [
      emailParagraph("Thanks for signing up. Confirm your email address to activate your Pryrox account and continue setup."),
      emailButton("Confirm email address", link),
      emailFallbackLink(link),
      emailParagraph('<span style="font-size:13px;color:#64748b;">This link expires in 24 hours for your security.</span>'),
    ].join(""),
  });
}

export function recoveryEmailHtml(link: string): string {
  return pryroxEmailLayout({
    title: "Reset your password",
    preheader: "Use the link below to choose a new Pryrox password.",
    bodyHtml: [
      emailParagraph("We received a request to reset the password for your Pryrox account. Click the button below to choose a new password."),
      emailButton("Reset password", link),
      emailFallbackLink(link),
      emailParagraph('<span style="font-size:13px;color:#64748b;">This link expires in 1 hour. If you did not request a reset, no action is needed.</span>'),
    ].join(""),
  });
}

export function emailChangeVerificationHtml(link: string): string {
  return pryroxEmailLayout({
    title: "Confirm your new email",
    preheader: "Click below to verify your new email address.",
    bodyHtml: [
      emailParagraph("You requested to change your Pryrox account email. Click the button below to confirm your new email address."),
      emailButton("Confirm new email", link),
      emailFallbackLink(link),
      emailParagraph('<span style="font-size:13px;color:#64748b;">This link expires in 1 hour. If you did not request this change, no action is needed.</span>'),
    ].join(""),
  });
}

export function emailChangeNotificationHtml(newEmail: string): string {
  return pryroxEmailLayout({
    title: "Email change requested",
    preheader: "Your Pryrox account email is being changed.",
    bodyHtml: [
      emailParagraph(`Your Pryrox account email is being changed to <strong>${escapeHtml(newEmail)}</strong>.`),
      emailParagraph("If you did not request this change, contact support immediately — your current email is still active until the new address is verified."),
    ].join(""),
    footerNote: "If you did not request this email, contact your administrator immediately.",
  });
}

export function staffInviteEmailHtml(options: {
  fullName: string;
  pharmacyName: string;
  role: string;
  signInUrl: string;
  temporaryPassword: string;
}): string {
  const roleLabel = (r: string) =>
    ({ pharmacist: "Pharmacist", cashier: "Cashier", owner: "Owner", manager: "Manager" })[r] ?? "Staff member";

  const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "there";
  const label = roleLabel(options.role);

  return pryroxEmailLayout({
    title: `You're invited to join ${options.pharmacyName} on Pryrox`,
    preheader: `${options.pharmacyName} invited you to join their team on Pryrox as ${label}.`,
    bodyHtml: [
      emailParagraph(`Hi, <strong>${escapeHtml(firstName(options.fullName))}</strong>!`),
      emailParagraph(
        `<strong>${escapeHtml(options.pharmacyName)}</strong> has invited you to use <strong>Pryrox</strong> to work with their pharmacy team as a <strong>${escapeHtml(label)}</strong>. Click the button below to sign in and set up your account.`,
      ),
      emailButton("Set up your account", options.signInUrl),
      emailCredentialsCard({ signInUrl: options.signInUrl, temporaryPassword: options.temporaryPassword }),
      emailFallbackLink(options.signInUrl),
    ].join(""),
  });
}

export function staffInviteEmailText(options: {
  fullName: string;
  pharmacyName: string;
  role: string;
  signInUrl: string;
  temporaryPassword: string;
}): string {
  const roleLabel = (r: string) =>
    ({ pharmacist: "Pharmacist", cashier: "Cashier", owner: "Owner", manager: "Manager" })[r] ?? "Staff member";
  const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "there";
  return [
    `Hi, ${firstName(options.fullName)}!`,
    ``,
    `${options.pharmacyName} has invited you to use Pryrox as a ${roleLabel(options.role)}.`,
    ``,
    `Set up your account: ${options.signInUrl}`,
    `Temporary password: ${options.temporaryPassword}`,
    ``,
    `Change your password after your first sign-in.`,
    ``,
    `Welcome aboard,`,
    `The Pryrox Team`,
  ].join("\n");
}

export function maintenanceEmailHtml(options: { message: string; scheduledAt: string }): string {
  return pryroxEmailLayout({
    title: "Scheduled maintenance notice",
    preheader: "Pryrox will be briefly unavailable for maintenance.",
    bodyHtml: [
      emailParagraph("We want to let you know that Pryrox will undergo scheduled maintenance."),
      emailParagraph(`<strong>Scheduled time:</strong> ${escapeHtml(options.scheduledAt)}`),
      emailParagraph(escapeHtml(options.message)),
      emailParagraph("We apologize for any inconvenience. The platform will be back online as soon as maintenance is complete."),
    ].join(""),
    footerNote: "You are receiving this because you are a registered Pryrox user.",
  });
}

export function maintenanceEmailText(options: { message: string; scheduledAt: string }): string {
  return [
    `Scheduled maintenance notice`,
    ``,
    `Pryrox will undergo scheduled maintenance.`,
    `Scheduled time: ${options.scheduledAt}`,
    ``,
    options.message,
    ``,
    `The platform will be back online as soon as maintenance is complete.`,
    ``,
    `The Pryrox Team`,
  ].join("\n");
}
