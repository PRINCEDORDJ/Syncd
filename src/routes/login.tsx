import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Sign in — SocialSync" },
      {
        name: "description",
        content: "Sign in to your SocialSync workspace.",
      },
    ],
  }),
  component: LoginPage,
});

type Mode = "signin" | "signup";

function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const search = Route.useSearch();
  const redirectTo = search.redirect ?? "/app";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If already logged in, leave the login page.
  useEffect(() => {
    if (!loading && user) {
      navigate({ to: redirectTo });
    }
  }, [user, loading, navigate, redirectTo]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo:
              typeof window !== "undefined" ? window.location.origin : undefined,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (err) throw err;
        setInfo(
          "Account created. If email confirmation is on, check your inbox — otherwise you're in.",
        );
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (err) throw err;
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background text-ink flex flex-col">
      <header className="px-6 md:px-8 py-6 max-w-7xl w-full mx-auto">
        <Link to="/" className="inline-flex items-center gap-2.5 group">
          <div className="size-2.5 rounded-full bg-gradient-to-br from-glow-start to-glow-end shadow-[0_0_10px_color-mix(in_oklab,var(--glow-start)_50%,transparent)]" />
          <span className="font-medium tracking-tight text-xl text-ink">SocialSync</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </p>
            <h1 className="text-3xl md:text-4xl tracking-tight font-light leading-tight">
              {mode === "signin" ? (
                <>
                  Sign in to your <span className="font-serif italic">workspace</span>
                </>
              ) : (
                <>
                  Start drafting on <span className="font-serif italic">glass</span>
                </>
              )}
            </h1>
          </div>

          <div className="rounded-3xl border border-border/70 bg-card p-7 md:p-8 shadow-soft">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {mode === "signup" && (
                <Field
                  id="display_name"
                  label="Display name"
                  type="text"
                  value={displayName}
                  onChange={setDisplayName}
                  placeholder="Elias Thorne"
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
                <div className="text-sm text-[color:var(--glow-end)] bg-[color:var(--glow-end)]/8 border border-[color:var(--glow-end)]/25 rounded-xl px-4 py-3">
                  {error}
                </div>
              )}
              {info && (
                <div className="text-sm text-ink bg-secondary border border-border/60 rounded-xl px-4 py-3">
                  {info}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full py-3.5 rounded-xl bg-ink text-white font-medium shadow-cta hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:hover:translate-y-0 flex items-center justify-center gap-2"
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

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signin" ? (
                <>
                  New to SocialSync?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setError(null);
                      setInfo(null);
                    }}
                    className="text-ink font-medium hover:text-[color:var(--glow-end)]"
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
                    className="text-ink font-medium hover:text-[color:var(--glow-end)]"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground font-light">
            By continuing you agree to draft thoughtfully and post even more thoughtfully.
          </p>
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
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
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
        className="px-4 py-3 rounded-xl border border-border bg-card text-ink placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[color:var(--glow-end)]/40 focus:border-[color:var(--glow-end)]/50 transition-all"
      />
    </label>
  );
}
