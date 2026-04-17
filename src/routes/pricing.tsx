import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — SocialSync" },
      {
        name: "description",
        content:
          "Simple pricing for SocialSync. One free draft per week, unlimited on Studio.",
      },
      { property: "og:title", content: "Pricing — SocialSync" },
      {
        property: "og:description",
        content: "One plan, one price, unlimited LinkedIn drafts.",
      },
    ],
  }),
  component: PricingPage,
});

const tiers = [
  {
    name: "Trial",
    price: "Free",
    cadence: "for 7 days",
    description: "Test the full workspace with no credit card.",
    features: [
      "5 generated drafts",
      "1 connected LinkedIn account",
      "Voice mapping (limited)",
      "Email support",
    ],
    cta: "Start free",
    highlighted: false,
  },
  {
    name: "Studio",
    price: "$24",
    cadence: "per month",
    description: "Everything you need to ship a serious LinkedIn cadence.",
    features: [
      "Unlimited drafts",
      "1 connected LinkedIn account",
      "Full voice mapping & memory",
      "Inline rewrites & tone dial",
      "Publish history",
      "Priority support",
    ],
    cta: "Open workspace",
    highlighted: true,
  },
  {
    name: "Studio for Teams",
    price: "$60",
    cadence: "per seat / month",
    description: "Shared voice profiles for executives and their writers.",
    features: [
      "Everything in Studio",
      "Up to 10 LinkedIn accounts",
      "Shared brand guidelines",
      "Approval workflow",
      "SSO & audit log",
    ],
    cta: "Talk to us",
    highlighted: false,
  },
];

function PricingPage() {
  return (
    <div className="min-h-dvh bg-background text-ink">
      <SiteNav />

      <main className="max-w-6xl mx-auto px-6 pt-16 md:pt-24 pb-16">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-5">
            Pricing
          </p>
          <h1 className="text-4xl md:text-6xl tracking-tight font-light leading-[1.1] text-balance">
            One <span className="font-serif italic">honest</span> price for serious writers.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground font-light">
            No usage meters. No prompt budgets. No surprises.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`relative flex flex-col gap-6 p-8 rounded-3xl border ${
                t.highlighted
                  ? "bg-ink text-surface border-ink shadow-cta"
                  : "bg-card text-ink border-border/60 shadow-soft"
              }`}
            >
              {t.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-glow-start to-glow-end text-surface text-[11px] font-semibold uppercase tracking-widest">
                  Most chosen
                </div>
              )}
              <div>
                <h3 className="text-lg font-medium tracking-tight">{t.name}</h3>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-5xl font-light tracking-tight tabular-nums">
                    {t.price}
                  </span>
                  <span
                    className={
                      t.highlighted ? "text-surface/60 text-sm" : "text-muted-foreground text-sm"
                    }
                  >
                    {t.cadence}
                  </span>
                </div>
                <p
                  className={`mt-3 text-sm font-light ${
                    t.highlighted ? "text-surface/70" : "text-muted-foreground"
                  }`}
                >
                  {t.description}
                </p>
              </div>

              <ul className="space-y-3 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span
                      className={`mt-2 size-1.5 rounded-full shrink-0 ${
                        t.highlighted
                          ? "bg-[color:var(--glow-start)]"
                          : "bg-[color:var(--glow-end)]"
                      }`}
                    />
                    <span className={t.highlighted ? "text-surface/85" : "text-ink/80"}>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                to="/app"
                className={`mt-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-medium transition-all ${
                  t.highlighted
                    ? "bg-secondary text-ink hover:-translate-y-0.5"
                    : "bg-ink text-surface hover:-translate-y-0.5"
                }`}
              >
                {t.cta}
                <span>→</span>
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-12 text-center text-sm text-muted-foreground font-light">
          All plans include a 7-day refund window. Cancel anytime from your workspace.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
