import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";

/**
 * Inline upgrade / low-credit banner rendered above the generate button.
 * Returns null when the user has plenty of credits or is admin.
 */
export function CreditBanner() {
  const c = useCredits();
  if (c.isLoading || c.error || c.isAdmin) return null;

  const isTrial = c.plan === "trial";
  const monthly = c.subscriptionCredits;
  const dailyLeft = Math.max(0, c.dailyLimit - c.dailyCreditsUsed);

  let tone: "warn" | "block" | null = null;
  let message: React.ReactNode = null;

  if (isTrial) {
    if (c.dailyCreditsUsed >= 5 || (monthly + c.topupCredits) <= 0) {
      tone = "block";
      message =
        c.dailyCreditsUsed >= 5
          ? "You've hit today's limit. Come back tomorrow or "
          : "You're out of credits for this month. ";
    } else if (c.dailyCreditsUsed >= 4) {
      tone = "warn";
      message = `You've used ${c.dailyCreditsUsed} of your ${c.dailyLimit} daily generations. `;
    } else if (monthly <= 8) {
      tone = "warn";
      message = `You have ${monthly} generation${monthly === 1 ? "" : "s"} left this month. `;
    }
  } else if (monthly + c.topupCredits <= 0) {
    tone = "block";
    message = "You're out of credits. ";
  } else if (monthly <= 20) {
    tone = "warn";
    message = `Running low — ${monthly} credits left. `;
  }

  if (!tone) return null;

  const cls =
    tone === "block"
      ? "bg-destructive/5 border-destructive/30 text-destructive"
      : "bg-amber-500/5 border-amber-500/30 text-amber-600 dark:text-amber-400";

  return (
    <div
      className={`flex items-start gap-2 px-3 py-2 rounded-md border text-[13px] ${cls}`}
      role="status"
    >
      <AlertTriangle className="size-4 mt-0.5 shrink-0" />
      <p className="leading-relaxed">
        {message}
        <Link
          to="/pricing"
          className="underline underline-offset-2 inline-flex items-center gap-0.5 font-medium hover:opacity-80"
        >
          {isTrial ? "Upgrade to Studio" : "Top up or upgrade"}
          <ArrowRight className="size-3.5" />
        </Link>
      </p>
    </div>
  );
}

export function useIsGenerationBlocked(): boolean {
  const c = useCredits();
  if (c.isLoading || c.error || c.isAdmin) return false;
  if (c.plan === "trial") {
    if (c.dailyCreditsUsed >= 5) return true;
  }
  return c.subscriptionCredits + c.topupCredits <= 0;
}