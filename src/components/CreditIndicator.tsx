import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCredits } from "@/hooks/useCredits";

export function CreditIndicator({ compact = false }: { compact?: boolean }) {
  const c = useCredits();

  if (c.isLoading) {
    return <Skeleton className="h-7 w-32 rounded-md" />;
  }
  if (c.error) return null;

  const isTrial = c.plan === "trial";
  const isAdmin = c.isAdmin;

  // Threshold color relative to monthly allocation
  const remainingRatio = c.monthlyAllocation
    ? c.subscriptionCredits / c.monthlyAllocation
    : 1;
  const tone = isAdmin
    ? "text-ink"
    : remainingRatio > 0.3
      ? "text-ink"
      : remainingRatio > 0.1
        ? "text-amber-500"
        : "text-destructive";

  let label: React.ReactNode;
  if (isAdmin) {
    label = <span>Unlimited</span>;
  } else if (isTrial) {
    const dailyLeft = Math.max(0, c.dailyLimit - c.dailyCreditsUsed);
    label = compact ? (
      <span className="tabular-nums">
        {dailyLeft}/{c.dailyLimit} today
      </span>
    ) : (
      <span className="tabular-nums">
        {dailyLeft}/{c.dailyLimit} today · {c.subscriptionCredits}/
        {c.monthlyAllocation} month
      </span>
    );
  } else {
    label = (
      <span className="tabular-nums">
        {c.subscriptionCredits} credits
        {c.topupCredits > 0 && (
          <span className="text-muted-foreground"> +{c.topupCredits} top-up</span>
        )}
      </span>
    );
  }

  return (
    <Link
      to="/pricing"
      title="Manage plan"
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-card hover:bg-subtle transition-colors text-[12px] font-medium ${tone}`}
    >
      <Zap className="size-3.5 shrink-0" />
      {label}
    </Link>
  );
}