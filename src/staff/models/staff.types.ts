/** Maximum number of rows accepted by a single bulk-import request. */
export const MAX_IMPORT_ROWS = 500;

/** Metadata flag forcing a password change on the next sign-in. */
export const MUST_CHANGE_PASSWORD_METADATA_KEY = "must_change_password";

/** Shown in API + toast — does not reveal whether the email exists in Pryrox. */
export const STAFF_INVITE_EMAIL_REJECTED_MESSAGE =
  "This email can't be used for a team member. Ask them to sign in with a different work email.";

export const STAFF_INVITE_EMAIL_REJECTED_CODE = "email_unavailable" as const;

export class StaffInviteEmailRejectedError extends Error {
  readonly code = STAFF_INVITE_EMAIL_REJECTED_CODE;

  constructor(message = STAFF_INVITE_EMAIL_REJECTED_MESSAGE) {
    super(message);
    this.name = "StaffInviteEmailRejectedError";
  }
}

/** Normalized pharmacy_users row. */
export type PharmacyStaffRow = {
  id: string;
  user_id: string | null;
  role: string;
  is_active: boolean | null;
  created_at: string | null;
  pharmacy_id: string | null;
};

/** Staff member in the dashboard list shape. */
export type FormattedStaffMember = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: string;
  status: "active" | "inactive";
  joinDate: string;
};

export type StaffInviteEmailResult =
  | { ok: true }
  | { ok: false; error: string; skipped?: boolean };

/** Auto-generated temporary password for staff invites and resends. */
export function generateTemporaryPassword(): string {
  return (
    Math.random().toString(36).slice(2, 6) +
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    "!1"
  );
}
