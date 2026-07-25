import { createFileRoute } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Syncd" },
      {
        name: "description",
        content: "The terms and conditions for using the Syncd platform.",
      },
      { property: "og:site_name", content: "Syncd" },
      { property: "og:title", content: "Terms of Service — Syncd" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-dvh bg-background text-ink">
      <SiteNav />

      <main className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-16">
        <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-4">
          Legal
        </p>
        <h1 className="text-4xl md:text-5xl tracking-[-0.02em] font-semibold leading-[1.05] text-balance">
          Terms of Service
        </h1>
        <p className="mt-5 text-[15px] text-muted-foreground font-mono">
          Last updated: May 14, 2026
        </p>

        <div className="mt-14 space-y-12">
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              1. Acceptance of Terms
            </h2>
            <p className="mt-4 text-[16px] text-muted-foreground leading-relaxed">
              By accessing or using Syncd ("Service"), you agree to be bound by
              these Terms of Service. If you do not agree to these terms, you may not
              use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              2. Use of Service
            </h2>
            <p className="mt-4 text-[16px] text-muted-foreground leading-relaxed">
              Syncd is a tool designed to help you draft and publish content to
              LinkedIn. You are responsible for maintaining the security of your
              account and for all activities that occur under your account.
            </p>
            <div className="mt-4 space-y-4">
              <p className="text-[16px] text-muted-foreground leading-relaxed">
                <strong className="text-ink">LinkedIn Compliance:</strong> You must
                comply with LinkedIn's User Agreement and Professional Community
                Policies. Syncd is not affiliated with or endorsed by LinkedIn.
              </p>
              <p className="text-[16px] text-muted-foreground leading-relaxed">
                <strong className="text-ink">Content Responsibility:</strong> You are
                solely responsible for the accuracy, legality, and appropriateness of
                any content you publish through the Service.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              3. AI-Generated Content
            </h2>
            <p className="mt-4 text-[16px] text-muted-foreground leading-relaxed">
              Syncd uses artificial intelligence to generate drafts. You
              acknowledge that AI-generated content may be inaccurate, incomplete, or
              inappropriate. You must review and edit all drafts before publishing.
              We are not responsible for any consequences resulting from the
              publication of AI-generated content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              4. Prohibited Conduct
            </h2>
            <p className="mt-4 text-[16px] text-muted-foreground leading-relaxed">
              You agree not to use the Service to:
            </p>
            <ul className="mt-4 space-y-3 list-disc list-inside text-[16px] text-muted-foreground leading-relaxed">
              <li>Publish spam, misleading content, or unauthorized advertisements.</li>
              <li>Harass, abuse, or harm another person.</li>
              <li>Violate the intellectual property rights of others.</li>
              <li>Attempt to reverse engineer or disrupt the Service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              5. Intellectual Property
            </h2>
            <p className="mt-4 text-[16px] text-muted-foreground leading-relaxed">
              You retain all ownership rights to the content you create and publish.
              Syncd owns all rights, title, and interest in and to the Service,
              including its code, design, and branding.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              6. Limitation of Liability
            </h2>
            <p className="mt-4 text-[16px] text-muted-foreground leading-relaxed">
              To the maximum extent permitted by law, Syncd shall not be liable
              for any indirect, incidental, special, consequential, or punitive
              damages, or any loss of profits or revenues, whether incurred directly
              or indirectly.
            </p>
          </section>

          <section className="pt-8 border-t border-border">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Contact Us
            </h2>
            <p className="mt-2 text-[16px] text-muted-foreground">
              If you have any questions about these Terms, please contact us
              at <a href="mailto:support@syncd.app" className="text-ink underline underline-offset-4">support@syncd.app</a>.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
