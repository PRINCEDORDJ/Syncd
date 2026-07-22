export type PlanTier = "trial" | "studio" | "teams";
export type BillingInterval = "month" | "year";

export interface PlanLimits {
  /** Monthly credit allowance (1 credit = 1 AI generation). */
  monthlyCredits: number;
  /** Daily generation cap (0 = no cap). */
  dailyCap: number;
  /** Max LinkedIn accounts that can be connected. */
  maxLinkedInAccounts: number;
  /** Team seats included. */
  teamSeats: number;
  /** Whether the plan exposes voice mapping. */
  voiceMapping: boolean;
  /** Whether the plan allows scheduling posts. */
  scheduling: boolean;
  /** Whether the plan supports credit top-ups. */
  topUps: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  trial: {
    monthlyCredits: 30,
    dailyCap: 5,
    maxLinkedInAccounts: 1,
    teamSeats: 1,
    voiceMapping: false,
    scheduling: false,
    topUps: false,
  },
  studio: {
    monthlyCredits: 100,
    dailyCap: 0,
    maxLinkedInAccounts: 1,
    teamSeats: 1,
    voiceMapping: true,
    scheduling: true,
    topUps: true,
  },
  teams: {
    monthlyCredits: 350,
    dailyCap: 0,
    maxLinkedInAccounts: 10,
    teamSeats: 5,
    voiceMapping: true,
    scheduling: true,
    topUps: true,
  },
};

export const PLAN_LABELS: Record<PlanTier, string> = {
  trial: "Free",
  studio: "Studio",
  teams: "Teams",
};

export interface TopUpPack {
  credits: number;
  priceUsd: number;
  key: "topup_50" | "topup_150" | "topup_500";
}

export const TOPUP_PACKS: TopUpPack[] = [
  { credits: 50, priceUsd: 4, key: "topup_50" },
  { credits: 150, priceUsd: 10, key: "topup_150" },
  { credits: 500, priceUsd: 25, key: "topup_500" },
];

export type CheckoutPlan =
  | "studio_monthly"
  | "studio_annual"
  | "teams_monthly"
  | "teams_annual"
  | "topup_50"
  | "topup_150"
  | "topup_500";