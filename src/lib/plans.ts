export type PlanTier = "trial" | "studio" | "teams";

export interface PlanLimits {
  /** Max generations per billing period (or trial period). null = unlimited. */
  maxDrafts: number | null;
  /** Max LinkedIn accounts that can be connected. */
  maxLinkedInAccounts: number;
  /** Whether the plan exposes voice mapping. */
  voiceMapping: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  trial: { maxDrafts: 5, maxLinkedInAccounts: 1, voiceMapping: false },
  studio: { maxDrafts: null, maxLinkedInAccounts: 1, voiceMapping: true },
  teams: { maxDrafts: null, maxLinkedInAccounts: 10, voiceMapping: true },
};

export const PLAN_LABELS: Record<PlanTier, string> = {
  trial: "Trial",
  studio: "Studio",
  teams: "Teams",
};