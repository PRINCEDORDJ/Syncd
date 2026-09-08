import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { BrandMark } from "@/components/BrandMark";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Sign in â€” Syncd" },
      { name: "description", content: "Sign in to your Syncd workspace." },
    ],
  }),
  component: LoginPage,
});

type Mode = "signin" | "signup";

function LoginPage() {
  const navigate = useNavigate();
  const { user, loading, onboarding } = useAuth();
  const search = Route.useSearch();
  const redirectTo = search.redirect ?? "/onboarding";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    const needsOnboarding = onboarding?.onboarding_status === "pending";
    navigate({ to: needsOnboarding ? "/onboarding" : redirectTo, replace: true });
  }, [user, loading, onboarding?.onboarding_status, navigate, redirectTo]);

  async function handleGoogle() {
    setError(null);
    setInfo(null);
    setGoogleSubmitting(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const redirectParam = encodeURIComponent(redirectTo);
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth?redirect=${redirectParam}`,
        },
      });
      if (err) throw err;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed.");
      setGoogleSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    try {
      if (mode === "signup") {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const redirectParam = encodeURIComponent(redirectTo);
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${origin}/auth?redirect=${redirectParam}`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (err) throw err;
        setInfo("Account created. We’ll finish setup after you confirm your email.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background text-ink flex flex-col">
      <header className="border-b border-border">
        <div className="px-6 md:px-8 h-14 max-w-7xl w-full mx-auto flex items-center">
          <Link to="/" className="inline-flex items-center gap-2 group">
            <BrandMark size={20} />
            <span className="font-semibold tracking-tight text-[15px] text-ink">
              Syncd
            </span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-3">
              {mode === "signin" ? "Welcome back" : "Create account"}
            </p>
            <h1 className="text-3xl tracking-[-0.02em] font-semibold leading-tight">
              {mode === "signin" ? "Sign in to Syncd" : "Start drafting"}
            </h1>
          </div>

          <div className="border border-border rounded-xl bg-card p-6 shadow-soft">
            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleSubmitting || submitting}
              className="w-full h-10 rounded-md border border-border bg-card text-ink text-[14px] font-medium hover:bg-subtle disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
            >
              <GoogleGlyph />
              {googleSubmitting ? "Redirecting…" : `Continue with Google`}
            </button>
            <div className="flex items-center gap-3 my-4">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em]">
                or
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {mode === "signup" && (
                <Field
                  id="display_name"
                  label="Display name"
                  type="text"
                  value={displayName}
                  onChange={setDisplayName}
                  placeholder="Jane Cooper"
                />
              )}
              <Field
                id="email"
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
              <Field
                id="password"
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="At least 6 characters"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />

              {error && (
                <div className="text-[13px] text-destructive bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2.5">
                  {error}
                </div>
              )}
              {info && (
                <div className="text-[13px] text-ink bg-subtle border border-border rounded-md px-3 py-2.5">
                  {info}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-1 h-10 rounded-md bg-ink text-surface text-[14px] font-medium hover:bg-ink/90 disabled:opacity-60 transition-colors"
              >
                {submitting
                  ? mode === "signin"
                    ? "Signing in…"
                    : "Creating account…"
                  : mode === "signin"
                    ? "Sign in"
                    : "Create account"}
              </button>
            </form>

            <div className="mt-5 text-center text-[13px] text-muted-foreground">
              {mode === "signin" ? (
                <>
                  New here?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setError(null);
                      setInfo(null);
                    }}
                    className="text-ink font-medium hover:underline"
                  >
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setError(null);
                      setInfo(null);
                    }}
                    className="text-ink font-medium hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
  minLength,
  autoComplete,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.12em]">
        {label}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="h-10 px-3 rounded-md border border-border bg-card text-[14px] text-ink placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink transition-all"
      />
    </label>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.3l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6C12.2 13.5 17.6 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.6-4.9 7.3l7.6 5.9c4.4-4.1 7.1-10.1 7.1-17.7z"/>
      <path fill="#FBBC05" d="M10.3 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6C.9 16.7 0 20.2 0 24s.9 7.3 2.5 10.7l7.8-6z"/>
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.4 0-11.8-4-13.7-9.8l-7.8 6C6.4 42.6 14.6 48 24 48z"/>
    </svg>
  );
}
