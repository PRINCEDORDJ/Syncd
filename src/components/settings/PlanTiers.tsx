import { type PlanTier } from "@/lib/plans";

const TIERS: Array<{
  id: "trial" | "studio" | "teams";
  name: string;
  priceMonthly: string;
  priceAnnual: string;
  cadenceMonthly: string;
  cadenceAnnual: string;
  description: string;
  features: string[];
  highlighted: boolean;
}> = [
  {
    id: "trial",
    name: "Free",
    priceMonthly: "$0",
    priceAnnual: "$0",
    cadenceMonthly: "forever",
    cadenceAnnual: "forever",
    description: "Try it — no card needed.",
    features: [
      "30 credits every month",
      "Solo workspace",
      "1 LinkedIn account",
      "200 MB media storage",
    ],
    highlighted: false,
  },
  {
    id: "studio",
    name: "Studio",
    priceMonthly: "$12",
    priceAnnual: "$115",
    cadenceMonthly: "per month",
    cadenceAnnual: "per year",
    description: "For creators who post weekly.",
    features: [
      "150 credits every month",
      "Voice profile — Syncd learns your writing",
      "Scheduling — queue posts for the perfect moment",
      "Priority generation",
      "5 GB media storage",
    ],
    highlighted: true,
  },
  {
    id: "teams",
    name: "Teams",
    priceMonthly: "$15 / seat",
    priceAnnual: "$144 / seat",
    cadenceMonthly: "per month · 2 seat min",
    cadenceAnnual: "per year · 2 seat min",
    description: "For teams who ship together.",
    features: [
      "150 credits per seat, pooled",
      "Shared draft library",
      "Review before publish",
      "Team voice consistency",
      "20 GB media storage",
    ],
    highlighted: false,
  },
];

export function PlanTiers({
  currentPlan,
  isAdmin,
  loadingPlan,
  error,
  onSelect,
  billingInterval,
  onIntervalChange,
}: {
  currentPlan: PlanTier;
  isAdmin: boolean;
  loadingPlan: "studio" | "teams" | null;
  error: string | null;
  onSelect: (plan: "studio" | "teams") => void;
  billingInterval: "month" | "year";
  onIntervalChange: (i: "month" | "year") => void;
}) {
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-ink">Change plan</h3>
        <div className="inline-flex items-center gap-0 rounded-md border border-border p-0.5 bg-card">
          {(["month", "year"] as const).map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => onIntervalChange(i)}
              className={`h-6 px-2 rounded text-[11px] font-medium transition-colors ${
                billingInterval === i ? "bg-ink text-surface" : "text-muted-foreground"
              }`}
            >
              {i === "month" ? "Monthly" : "Yearly · save 17%"}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <div className="mb-3 px-3 py-2 rounded-md bg-destructive/5 border border-destructive/20 text-destructive text-[12px]">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {TIERS.map((t) => {
          const isCurrent = currentPlan === t.id;
          const adminOwned = isAdmin && t.id === "teams";
          const active = isCurrent || adminOwned;
          const price = billingInterval === "year" ? t.priceAnnual : t.priceMonthly;
          const cadence = billingInterval === "year" ? t.cadenceAnnual : t.cadenceMonthly;
          return (
            <div
              key={t.id}
              className={`relative flex flex-col gap-4 p-4 rounded-lg border ${
                t.highlighted
                  ? "bg-ink text-surface border-ink"
                  : "bg-card text-ink border-border"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="text-[14px] font-semibold">{t.name}</h4>
                  {active && (
                    <span
                      className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                        t.highlighted
                          ? "bg-surface/10 border-surface/20 text-surface"
                          : "bg-subtle border-border text-muted-foreground"
                      }`}
                    >
                      {adminOwned ? "Admin" : "Current"}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl font-semibold tracking-[-0.02em] tabular-nums">
                    {price}
                  </span>
                  <span
                    className={`text-[12px] ${
                      t.highlighted ? "text-surface/60" : "text-muted-foreground"
                    }`}
                  >
                    {cadence}
                  </span>
                </div>
                <p
                  className={`mt-2 text-[12px] ${
                    t.highlighted ? "text-surface/70" : "text-muted-foreground"
                  }`}
                >
                  {t.description}
                </p>
              </div>
              <ul className="space-y-1.5 text-[12px]">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span
                      className={`mt-1.5 size-1 rounded-full shrink-0 ${
                        t.highlighted ? "bg-surface/60" : "bg-ink/40"
                      }`}
                    />
                    <span className={t.highlighted ? "text-surface/85" : "text-ink/80"}>{f}</span>
                  </li>
                ))}
              </ul>
              {t.id === "trial" ? (
                <div
                  className={`mt-auto text-center text-[12px] ${
                    t.highlighted ? "text-surface/60" : "text-muted-foreground"
                  }`}
                >
                  {active ? "You're on the trial" : "Included by default"}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(t.id as "studio" | "teams")}
                  disabled={loadingPlan !== null || active}
                  className={`mt-auto h-9 px-3 rounded-md text-[13px] font-medium transition-colors disabled:opacity-50 ${
                    t.highlighted
                      ? "bg-surface text-ink hover:bg-surface/90"
                      : "bg-ink text-surface hover:bg-ink/90"
                  }`}
                >
                  {loadingPlan === t.id
                    ? "Redirecting…"
                    : active
                      ? adminOwned
                        ? "Included"
                        : "Current plan"
                      : "Choose plan"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
