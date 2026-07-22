export class EntitlementError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 403,
    public readonly upgradeFeature?: string,
  ) {
    super(message);
    this.name = "EntitlementError";
  }
}

export function isEntitlementsEnforced(): boolean {
  const flag = process.env.ENTITLEMENTS_ENFORCE;
  if (flag === "false" || flag === "0") return false;
  return true;
}
