// Pryrox branded email layout engine — ported from frontend/src/lib/email/layout.ts

const BRAND = "#003459";
const BRAND_LIGHT = "#2d6a8f";
const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type EmailLayoutOptions = {
  title: string;
  bodyHtml: string;
  preheader?: string;
  footerNote?: string;
};

export function pryroxEmailLayout(options: EmailLayoutOptions): string {
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? process.env["APP_URL"] ?? "https://pryrox.com";
  const title = escapeHtml(options.title);
  const preheader = options.preheader ? escapeHtml(options.preheader) : escapeHtml(options.title);
  const footerNote = options.footerNote ?? "If you did not request this email, you can safely ignore it.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>@media only screen and (max-width:620px){.email-body-cell{padding:28px 20px!important;}.email-button{display:block!important;width:100%!important;text-align:center!important;box-sizing:border-box!important;}}</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td style="padding:0 0 20px;text-align:center;">
          <a href="${escapeHtml(appUrl)}" style="text-decoration:none;display:inline-block;">
            <span style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${BRAND};">Pryrox</span>
          </a>
        </td></tr>
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
            <tr><td style="height:4px;background:linear-gradient(90deg,${BRAND} 0%,${BRAND_LIGHT} 100%);font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td class="email-body-cell" style="padding:36px 40px 32px;">
              <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;color:#0f172a;">${title}</h1>
              <div style="font-size:15px;line-height:1.65;color:#334155;">${options.bodyHtml}</div>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 8px 0;text-align:center;">
          <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#64748b;">${escapeHtml(footerNote)}</p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">&copy; ${new Date().getFullYear()} Pryrox &middot; <a href="${escapeHtml(appUrl)}" style="color:#64748b;text-decoration:underline;">${escapeHtml(appUrl.replace(/^https?:\/\//, ""))}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function emailParagraph(text: string): string {
  return `<p style="margin:0 0 16px;">${text}</p>`;
}

export function emailButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr><td><a class="email-button" href="${escapeHtml(href)}" style="display:inline-block;background-color:${BRAND};color:#ffffff;font-size:15px;font-weight:600;line-height:1;text-decoration:none;padding:14px 28px;border-radius:8px;">
      <span>${escapeHtml(label)}</span>
    </a></td></tr>
  </table>`;
}

export function emailFallbackLink(href: string): string {
  return `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#64748b;">Or copy and paste this link into your browser:<br /><a href="${escapeHtml(href)}" style="color:${BRAND};word-break:break-all;text-decoration:underline;">${escapeHtml(href)}</a></p>`;
}

export function emailCredentialsCard(options: { signInUrl: string; temporaryPassword: string }): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
    <tr><td style="padding:20px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:600;text-transform:uppercase;color:#64748b;">Sign-in URL</p>
      <p style="margin:0 0 18px;font-size:14px;word-break:break-all;"><a href="${escapeHtml(options.signInUrl)}" style="color:${BRAND};text-decoration:underline;">${escapeHtml(options.signInUrl)}</a></p>
      <p style="margin:0 0 6px;font-size:12px;font-weight:600;text-transform:uppercase;color:#64748b;">Temporary password</p>
      <p style="margin:0;font-size:18px;font-weight:700;font-family:monospace;color:#0f172a;background:#fff;border:1px dashed #cbd5e1;border-radius:6px;padding:10px 12px;display:inline-block;">${escapeHtml(options.temporaryPassword)}</p>
    </td></tr>
  </table>`;
}
