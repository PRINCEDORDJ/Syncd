import { createFileRoute } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Syncd" },
      {
        name: "description",
        content: "How we handle your data and protect your privacy at Syncd.",
      },
      { property: "og:site_name", content: "Syncd" },
      { property: "og:title", content: "Privacy Policy — Syncd" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-background text-ink">
      <SiteNav />

      <main className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-16">
        <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-4">
          Legal
        </p>
        <h1 className="text-4xl md:text-5xl tracking-[-0.02em] font-semibold leading-[1.05] text-balance">
          Privacy Policy
        </h1>
        <p className="mt-5 text-[15px] text-muted-foreground font-mono">
          Last updated: May 14, 2026
        </p>

        <div className="mt-14 space-y-12">
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              1. Overview
            </h2>
            <p className="mt-4 text-[16px] text-muted-foreground leading-relaxed">
              Syncd ("we," "us," or "our") is committed to protecting your privacy.
              This Privacy Policy explains how we collect, use, and safeguard your
              information when you use our platform to draft and publish LinkedIn
              content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              2. Information We Collect
            </h2>
            <div className="mt-4 space-y-4">
              <p className="text-[16px] text-muted-foreground leading-relaxed">
                <strong className="text-ink">LinkedIn Data:</strong> When you connect
                your LinkedIn account, we receive an OAuth access token. This allows
                us to access your basic profile information (name, profile picture) and
                permits us to publish posts on your behalf. We do not see or store your
                LinkedIn password.
              </p>
              <p className="text-[16px] text-muted-foreground leading-relaxed">
                <strong className="text-ink">Content Data:</strong> We store the raw
                thoughts, transcripts, and drafts you create within Syncd so you
                can access them later.
              </p>
              <p className="text-[16px] text-muted-foreground leading-relaxed">
                <strong className="text-ink">Usage Data:</strong> We collect anonymous
                analytics about how you interact with the app to help us improve the
                user experience.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              3. How We Use Your Information
            </h2>
            <ul className="mt-4 space-y-3 list-disc list-inside text-[16px] text-muted-foreground leading-relaxed">
              <li>To provide, maintain, and improve our services.</li>
              <li>To generate draft content using third-party AI models.</li>
              <li>To publish approved drafts directly to your LinkedIn profile.</li>
              <li>To communicate with you about updates or support requests.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              4. Data Security
            </h2>
            <p className="mt-4 text-[16px] text-muted-foreground leading-relaxed">
              We implement industry-standard security measures to protect your data.
              Your LinkedIn access tokens are encrypted and stored securely. We use
              SSL/TLS encryption for all data in transit.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              5. Third-Party Services
            </h2>
            <p className="mt-4 text-[16px] text-muted-foreground leading-relaxed">
              We use third-party AI providers (such as OpenAI or Anthropic) to
              process your raw input into drafts. These providers do not use your
              data to train their models unless explicitly stated otherwise. We also
              use Supabase for database management and authentication.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              6. Your Rights
            </h2>
            <p className="mt-4 text-[16px] text-muted-foreground leading-relaxed">
              You can disconnect your LinkedIn account at any time from the settings
              page, which will revoke our access token. You may also request the
              deletion of your account and all associated data by contacting us.
            </p>
          </section>

          <section className="pt-8 border-t border-border">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Contact Us
            </h2>
            <p className="mt-2 text-[16px] text-muted-foreground">
              If you have any questions about this Privacy Policy, please contact us
              at <a href="mailto:privacy@syncd.app" className="text-ink underline underline-offset-4">privacy@syncd.app</a>.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
