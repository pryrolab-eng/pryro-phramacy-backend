export const INVALID_EMAIL_MESSAGE = "Please provide a valid email address.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function normalizeEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}
