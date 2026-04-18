import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — SocialSync" },
      {
        name: "description",
        content: "Simple pricing. One free trial week, unlimited drafts on Studio.",
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
    description: "Test the full workspace. No credit card required.",
    features: [
      "5 generated drafts",
      "1 connected LinkedIn account",
      "Voice notes (limited)",
      "Email support",
    ],
    cta: "Start free",
    highlighted: false,
  },
  {
    name: "Studio",
    price: "$24",
    cadence: "per month",
    description: "Everything you need to ship a serious cadence.",
    features: [
      "Unlimited drafts",
      "1 connected LinkedIn account",
      "Full voice mapping",
      "Tone dial & inline rewrites",
      "Publish history",
      "Priority support",
    ],
    cta: "Open workspace",
    highlighted: true,
  },
  {
    name: "Teams",
    price: "$60",
    cadence: "per seat / month",
    description: "Shared voice profiles for execs and ghost-writers.",
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
          <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-4">
            Pricing
          </p>
          <h1 className="text-4xl md:text-5xl tracking-[-0.02em] font-semibold leading-[1.05] text-balance">
            One honest price for serious writers.
          </h1>
          <p className="mt-4 text-[16px] text-muted-foreground">
            No usage meters. No prompt budgets. No surprises.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-4">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`relative flex flex-col gap-6 p-7 rounded-xl border transition-all ${
                t.highlighted
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
                <h3 className="text-[15px] font-semibold tracking-tight">{t.name}</h3>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-4xl font-semibold tracking-[-0.03em] tabular-nums">
                    {t.price}
                  </span>
                  <span
                    className={`text-[13px] ${
                      t.highlighted ? "text-surface/60" : "text-muted-foreground"
                    }`}
                  >
                    {t.cadence}
                  </span>
                </div>
                <p
                  className={`mt-3 text-[13px] ${
                    t.highlighted ? "text-surface/70" : "text-muted-foreground"
                  }`}
                >
                  {t.description}
                </p>
              </div>

              <ul className="space-y-2.5 text-[13px]">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span
                      className={`mt-1.5 size-1 rounded-full shrink-0 ${
                        t.highlighted ? "bg-surface/60" : "bg-ink/40"
                      }`}
                    />
                    <span className={t.highlighted ? "text-surface/85" : "text-ink/80"}>
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                to="/app"
                className={`mt-auto inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-md text-[13px] font-medium transition-colors ${
                  t.highlighted
                    ? "bg-surface text-ink hover:bg-surface/90"
                    : "bg-ink text-surface hover:bg-ink/90"
                }`}
              >
                {t.cta}
                <span aria-hidden>→</span>
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-[12px] font-mono text-muted-foreground">
          7-day refund window · Cancel anytime
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
