import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "./ui-primitives";
import { PlanTiers } from "./PlanTiers";
import {
  PLAN_LIMITS,
  PLAN_LABELS,
  TOPUP_PACKS,
  type CheckoutPlan,
  type PlanTier,
} from "@/lib/plans";

interface SubscriptionRow {
  plan: PlanTier;
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  polar_customer_id: string | null;
}

interface Credits {
  subscription: number;
  topup: number;
  dailyUsed: number;
}

export function BillingSettingsPanel({
  user,
  effectivePlan,
  effectiveStatus,
  isAdmin,
  sub,
  credits,
  billingInterval,
  onIntervalChange,
}: {
  user: User;
  effectivePlan: PlanTier;
  effectiveStatus: string;
  isAdmin: boolean;
  sub: SubscriptionRow | null;
  credits: Credits | null;
  billingInterval: "month" | "year";
  onIntervalChange: (i: "month" | "year") => void;
}) {
  const [openingPortal, setOpeningPortal] = useState(false);
  const [billingMsg, setBillingMsg] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<"studio" | "teams" | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState<CheckoutPlan | null>(null);

  async function openBillingPortal() {
    setOpeningPortal(true);
    setBillingMsg(null);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setBillingMsg("Session expired — please sign in again.");
      setOpeningPortal(false);
      return;
    }
    const resp = await fetch("/api/polar/portal", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await resp.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (!resp.ok || !data.url) {
      setBillingMsg(data.error ?? "Failed to open billing portal.");
      setOpeningPortal(false);
      return;
    }
    window.location.href = data.url;
  }

  async function startCheckout(plan: "studio" | "teams") {
    setCheckoutError(null);
    setCheckoutPlan(plan);
    const key = (plan === "studio"
      ? billingInterval === "year"
        ? "studio_annual"
        : "studio_monthly"
      : billingInterval === "year"
        ? "teams_annual"
        : "teams_monthly") as CheckoutPlan;
    setCheckoutBusy(key);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setCheckoutError("Session expired — please sign in again.");
      setCheckoutPlan(null);
      setCheckoutBusy(null);
      return;
    }
    const resp = await fetch("/api/polar/checkout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ plan: key }),
    });
    const data = (await resp.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!resp.ok || !data.url) {
      setCheckoutError(data.error ?? "Failed to start checkout.");
      setCheckoutPlan(null);
      setCheckoutBusy(null);
      return;
    }
    window.location.href = data.url;
  }

  async function buyTopup(key: CheckoutPlan) {
    setCheckoutError(null);
    setCheckoutBusy(key);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setCheckoutError("Session expired — please sign in again.");
      setCheckoutBusy(null);
      return;
    }
    const resp = await fetch("/api/polar/checkout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ plan: key }),
    });
    const data = (await resp.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!resp.ok || !data.url) {
      setCheckoutError(data.error ?? "Failed to start checkout.");
      setCheckoutBusy(null);
      return;
    }
    window.location.href = data.url;
  }

  const monthlyLimit = PLAN_LIMITS[effectivePlan].monthlyCredits;
  const linkedInMax = PLAN_LIMITS[effectivePlan].maxLinkedInAccounts;
  const subCredits = isAdmin ? Infinity : (credits?.subscription ?? 0);
  const topupCredits = credits?.topup ?? 0;
  const draftStr = isAdmin
    ? "Unlimited credits"
    : `${subCredits} of ${monthlyLimit} monthly credits`;
  const dailyCap = PLAN_LIMITS[effectivePlan].dailyCap;

  return (
    <Section title="Billing & plan" subtitle="Your current subscription and usage limits.">
      {billingMsg && (
        <div className="px-3 py-2 rounded-md border border-border bg-subtle text-[13px] text-ink">
          {billingMsg}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-4 border border-border rounded-md bg-subtle/40">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-ink">
            {PLAN_LABELS[effectivePlan]} plan
            <span className="ml-2 text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
              {effectiveStatus}
            </span>
          </div>
          <div className="text-[12px] text-muted-foreground mt-1">
            {draftStr}
            {topupCredits > 0 && !isAdmin ? ` · +${topupCredits} top-up` : ""}
            {" · "}{linkedInMax} LinkedIn account{linkedInMax > 1 ? "s" : ""}
            {dailyCap > 0 && !isAdmin ? ` · ${dailyCap}/day cap` : ""}
          </div>
          {isAdmin ? (
            <div className="text-[12px] text-muted-foreground mt-0.5">
              Admin access — all features unlocked, no billing required.
            </div>
          ) : sub?.plan === "trial" && sub.trial_end ? (
            <div className="text-[12px] text-muted-foreground mt-0.5">
              Trial ends {new Date(sub.trial_end).toLocaleDateString()}
            </div>
          ) : sub && sub.plan !== "trial" && sub.current_period_end ? (
            <div className="text-[12px] text-muted-foreground mt-0.5">
              {sub.cancel_at_period_end ? "Cancels" : "Renews"} on{" "}
              {new Date(sub.current_period_end).toLocaleDateString()}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:items-end w-full sm:w-auto">
          {isAdmin ? null : sub?.polar_customer_id ? (
            <button
              type="button"
              onClick={openBillingPortal}
              disabled={openingPortal}
              className="h-9 px-3 rounded-md border border-border text-[13px] text-ink hover:bg-subtle disabled:opacity-60 w-full sm:w-auto"
            >
              {openingPortal ? "Opening…" : "Manage billing"}
            </button>
          ) : null}
        </div>
      </div>

      <PlanTiers
        currentPlan={effectivePlan}
        isAdmin={isAdmin}
        loadingPlan={checkoutPlan}
        billingInterval={billingInterval}
        onIntervalChange={onIntervalChange}
        error={checkoutError}
        onSelect={startCheckout}
      />

      {!isAdmin && (effectivePlan === "studio" || effectivePlan === "teams") && (
        <div className="mt-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-[13px] font-semibold text-ink">Credit top-ups</h3>
            <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.12em]">
              Never expire
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TOPUP_PACKS.map((p) => (
              <div
                key={p.key}
                className="border border-border rounded-lg p-4 bg-card flex flex-col gap-3"
              >
                <div>
                  <div className="text-[15px] font-semibold text-ink tabular-nums">
                    {p.credits} credits
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    ${p.priceUsd} — {(p.priceUsd / p.credits * 100).toFixed(1)}¢ per credit
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => buyTopup(p.key)}
                  disabled={checkoutBusy !== null}
                  className="mt-auto h-9 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-50"
                >
                  {checkoutBusy === p.key ? "Redirecting…" : "Buy"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}
