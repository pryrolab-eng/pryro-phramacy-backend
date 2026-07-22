/** Minimal user shape shared with Next.js native auth. */
export type AuthUser = {
  id: string;
  email: string | null;
  user_metadata?: Record<string, unknown>;
};

export type SessionJwtPayload = {
  sub: string;
  sid: string;
};

export const AUTH_USER_REQUEST_KEY = "authUser";
