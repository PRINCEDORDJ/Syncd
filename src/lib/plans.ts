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
  /** Max workspaces user can create / own. */
  maxWorkspaces: number;
  /** Max members per workspace. */
  maxWorkspaceMembers: number;
  /** Whether the plan allows team-level workspace access grants. */
  allowsTeamWorkspaceAccess: boolean;
  /** Whether the plan exposes voice mapping. */
  voiceMapping: boolean;
  /** Whether the plan allows scheduling posts. */
  scheduling: boolean;
  /** Whether the plan supports credit top-ups. */
  topUps: boolean;
  /** Cumulative storage quota in bytes. */
  storageBytes: number;
  /** Max single-file upload size in bytes. */
  maxFileSizeBytes: number;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  trial: {
    monthlyCredits: 30,
    dailyCap: 5,
    maxLinkedInAccounts: 1,
    teamSeats: 1,
    maxWorkspaces: 1,
    maxWorkspaceMembers: 1,
    allowsTeamWorkspaceAccess: false,
    voiceMapping: false,
    scheduling: false,
    topUps: false,
    storageBytes: 209_715_200, // 200 MB
    maxFileSizeBytes: 10_485_760, // 10 MB
  },
  studio: {
    monthlyCredits: 100,
    dailyCap: 0,
    maxLinkedInAccounts: 1,
    teamSeats: 1,
    maxWorkspaces: 3,
    maxWorkspaceMembers: 1,
    allowsTeamWorkspaceAccess: false,
    voiceMapping: true,
    scheduling: true,
    topUps: true,
    storageBytes: 5_368_709_120, // 5 GB
    maxFileSizeBytes: 26_214_400, // 25 MB
  },
  teams: {
    monthlyCredits: 350,
    dailyCap: 0,
    maxLinkedInAccounts: 10,
    teamSeats: 5,
    maxWorkspaces: 999, // Unlimited
    maxWorkspaceMembers: 5,
    allowsTeamWorkspaceAccess: true,
    voiceMapping: true,
    scheduling: true,
    topUps: true,
    storageBytes: 21_474_836_480, // 20 GB
    maxFileSizeBytes: 52_428_800, // 50 MB
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