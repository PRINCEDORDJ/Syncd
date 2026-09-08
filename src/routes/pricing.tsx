import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { type PlanTier, TOPUP_PACKS, type BillingInterval } from "@/lib/plans";
import { getUserPlanAndLimits } from "@/lib/workspace-access";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Syncd" },
      {
        name: "description",
        content: "Simple pricing. One free trial week, unlimited drafts on Studio.",
      },
      { property: "og:title", content: "Pricing — Syncd" },
      {
        property: "og:description",
        content: "One plan, one price, unlimited LinkedIn drafts.",
      },
    ],
  }),
  component: PricingPage,
});

type TierId = "trial" | "studio" | "teams";

interface TierDef {
  id: TierId;
  name: string;
  monthly: number | null;
  annual: number | null;
  description: string;
  features: string[];
  cta: string;
  highlighted: boolean;
}

const tiers: TierDef[] = [
  {
    id: "trial",
    name: "Free",
    monthly: 0,
    annual: 0,
    description: "Test the workspace with a monthly credit allowance.",
    features: [
      "30 credits / month (5/day cap)",
      "1 Workspace & 2 Projects",
      "1 LinkedIn account",
    ],
    cta: "Start free",
    highlighted: false,
  },
  {
    id: "studio",
    name: "Studio",
    monthly: 9,
    annual: 90,
    description: "For solo writers shipping a serious cadence across multiple projects.",
    features: [
      "100 credits / month (No daily cap)",
      "Up to 3 Workspaces",
      "Up to 10 Projects per workspace",
      "Direct project collaborator grants",
      "Voice mapping & tone dial",
      "Post scheduling & Top-ups",
    ],
    cta: "Choose Studio",
    highlighted: true,
  },
  {
    id: "teams",
    name: "Teams",
    monthly: 29,
    annual: 290,
    description: "Shared workspaces for agencies, founders, execs & collaborative teams.",
    features: [
      "350 credits / month",
      "Unlimited Workspaces & Projects",
      "Up to 5 Workspace Team seats",
      "Team-level workspace access grants",
      "Role-based permissions (Owner, Admin, Member)",
      "Up to 10 LinkedIn accounts",
    ],
    cta: "Choose Teams",
    highlighted: false,
  },
];

function PricingPage() {
  const { user } = useAuth();
  const [subPlan, setSubPlan] = useState<PlanTier | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [, setInitialLoading] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("month");

  useEffect(() => {
    if (!user) {
      setInitialLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const { plan, isAdmin: userIsAdmin } = await getUserPlanAndLimits(user.id);

      if (cancelled) return;

      setSubPlan(plan);
      setIsAdmin(userIsAdmin);
      setInitialLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  async function startCheckout(planKey: string) {
    setError(null);
    if (!user) {
      window.location.href = `/login?redirect=/pricing`;
      return;
    }
    setLoadingPlan(planKey);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setError("Session expired — please sign in again.");
      setLoadingPlan(null);
      return;
    }
    const resp = await fetch("/api/polar/checkout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plan: planKey }),
    });
    const data = (await resp.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (!resp.ok || !data.url) {
      setError(data.error ?? "Failed to start checkout.");
      setLoadingPlan(null);
      return;
    }
    window.location.href = data.url;
  }

  return (
    <div className="min-h-dvh bg-background text-ink">
      <SiteNav />

      <main className="max-w-6xl mx-auto px-6 pt-16 md:pt-24 pb-16">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-4">
            Pricing
          </p>
          <h1 className="text-4xl md:text-5xl tracking-[-0.02em] font-semibold leading-[1.05] text-balance">
            One honest price for serious writers.
          </h1>
          <p className="mt-4 text-[16px] text-muted-foreground">
            Credit-based generations. Top up anytime. Cancel anytime.
          </p>

          <div className="mt-6 inline-flex items-center gap-1 p-1 rounded-full border border-border bg-card text-[12px] font-mono">
            <button
              type="button"
              onClick={() => setInterval("month")}
              className={`px-3 h-7 rounded-full transition-colors ${interval === "month" ? "bg-ink text-surface" : "text-muted-foreground"
                }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setInterval("year")}
              className={`px-3 h-7 rounded-full transition-colors ${interval === "year" ? "bg-ink text-surface" : "text-muted-foreground"
                }`}
            >
              Yearly <span className="opacity-60">· save ~17%</span>
            </button>
          </div>

          {error && (
            <div className="mt-4 inline-block px-3 py-1.5 rounded-md bg-destructive/5 border border-destructive/20 text-destructive text-[13px]">
              {error}
            </div>
          )}
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-4">
          {tiers.map((t) => {
            const isCurrentPlan = subPlan === t.id;
            const showAdminAccess = isAdmin && t.id === "teams";
            const isActive = isCurrentPlan || showAdminAccess;
            const priceNum = interval === "year" ? t.annual : t.monthly;
            const priceLabel =
              t.id === "trial"
                ? "Free"
                : priceNum == null
                  ? "—"
                  : `$${priceNum}`;
            const cadence =
              t.id === "trial"
                ? "forever"
                : interval === "year"
                  ? "per year"
                  : "per month";
            const planKey =
              t.id === "studio"
                ? interval === "year"
                  ? "studio_annual"
                  : "studio_monthly"
                : t.id === "teams"
                  ? interval === "year"
                    ? "teams_annual"
                    : "teams_monthly"
                  : "";

            return (
              <div
                key={t.id}
                className={`relative flex flex-col gap-6 p-7 rounded-xl border transition-all ${t.highlighted
                  ? "bg-ink text-surface border-ink shadow-pop"
                  : "bg-card text-ink border-border hover:border-ink/30"
                  }`}
              >
                {t.highlighted && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-surface text-ink text-[10px] font-mono uppercase tracking-[0.12em] border border-border">
                    Most chosen
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-[15px] font-semibold tracking-tight">{t.name}</h3>
                    {isActive && (
                      <span
                        className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${t.highlighted
                          ? "bg-surface/10 border-surface/20 text-surface"
                          : "bg-subtle border-border text-muted-foreground"
                          }`}
                      >
                        {isAdmin && t.id === "teams" ? "Admin Access" : "Current Plan"}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="text-4xl font-semibold tracking-[-0.03em] tabular-nums">
                      {priceLabel}
                    </span>
                    <span
                      className={`text-[13px] ${t.highlighted ? "text-surface/60" : "text-muted-foreground"
                        }`}
                    >
                      {cadence}
                    </span>
                  </div>
                  <p
                    className={`mt-3 text-[13px] ${t.highlighted ? "text-surface/70" : "text-muted-foreground"
                      }`}
                  >
                    {t.description}
                  </p>
                </div>

                <ul className="space-y-2.5 text-[13px]">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span
                        className={`mt-1.5 size-1 rounded-full shrink-0 ${t.highlighted ? "bg-surface/60" : "bg-ink/40"
                          }`}
                      />
                      <span className={t.highlighted ? "text-surface/85" : "text-ink/80"}>
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>

                {t.id === "trial" ? (
                  <Link
                    to="/app"
                    disabled={isActive}
                    className={`mt-auto inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-md text-[13px] font-medium transition-colors ${isActive ? "opacity-50 cursor-default" : ""
                      } ${t.highlighted
                        ? "bg-surface text-ink hover:bg-surface/90"
                        : "bg-ink text-surface hover:bg-ink/90"
                      }`}
                  >
                    {isActive ? "Already active" : t.cta}
                    {!isActive && <span aria-hidden>→</span>}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => startCheckout(planKey)}
                    disabled={loadingPlan !== null || isActive || (isAdmin && t.id !== "teams")}
                    className={`mt-auto inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-md text-[13px] font-medium transition-colors disabled:opacity-50 ${t.highlighted
                      ? "bg-surface text-ink hover:bg-surface/90"
                      : "bg-ink text-surface hover:bg-ink/90"
                      }`}
                  >
                    {loadingPlan === planKey
                      ? "Redirecting…"
                      : isActive
                        ? "Already active"
                        : isAdmin
                          ? "Included"
                          : t.cta}
                    {!isActive && !isAdmin && <span aria-hidden>→</span>}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <section className="mt-16">
          <div className="text-center max-w-xl mx-auto">
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-2">
              Top-ups
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.02em]">
              Need more credits this month?
            </h2>
            <p className="mt-2 text-[14px] text-muted-foreground">
              Add non-expiring credits to any paid plan. One-time purchase.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {TOPUP_PACKS.map((pack) => (
              <button
                key={pack.key}
                type="button"
                disabled={loadingPlan !== null || !user}
                onClick={() => startCheckout(pack.key)}
                className="flex flex-col items-start gap-2 p-5 rounded-xl border border-border bg-card hover:border-ink/30 transition-colors text-left disabled:opacity-50"
              >
                <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
                  {pack.credits} credits
                </span>
                <span className="text-2xl font-semibold tracking-[-0.02em]">
                  ${pack.priceUsd}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {loadingPlan === pack.key ? "Redirecting…" : "Buy pack →"}
                </span>
              </button>
            ))}
          </div>
        </section>

        <p className="mt-12 text-center text-[12px] font-mono text-muted-foreground">
          Cancel anytime · Top-up credits never expire
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}