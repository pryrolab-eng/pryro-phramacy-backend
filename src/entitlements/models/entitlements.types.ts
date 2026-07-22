export type AccessBlockReason =
  | "none"
  | "pharmacy_suspended"
  | "pharmacy_inactive"
  | "pending_payment"
  | "subscription_expired"
  | "subscription_cancelled"
  | "past_due"
  | "no_subscription";

export type EntitlementPlan = {
  id: string;
  name: string;
  price: number;
  period: string | null;
  max_users?: number;
  max_branches?: number;
  monthly_tx_limit?: number;
};

export type PharmacyEntitlements = {
  pharmacyId: string;
  pharmacyStatus: string;
  effectivePlan: EntitlementPlan | null;
  effectivePlanLabel: string;
  isAccessAllowed: boolean;
  accessBlockReason: AccessBlockReason;
  isExpired: boolean;
  daysRemaining: number | null;
  featureKeys: string[];
  limits: {
    maxUsers: number;
    maxBranches: number;
    monthlyTxPerBranch: number;
    totalBranchSlots: number;
  };
  usage: { activeUsers: number; activeBranches: number };
};
