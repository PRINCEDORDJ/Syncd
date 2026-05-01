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
      { title: "Sign in — SocialSync" },
      { name: "description", content: "Sign in to your SocialSync workspace." },
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

  useEffect(() => {
    if (!loading && user) navigate({ to: redirectTo });
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
        setInfo("Account created. Check your inbox if email confirmation is on.");
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
              SocialSync
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
              {mode === "signin" ? "Sign in to SocialSync" : "Start drafting"}
            </h1>
          </div>

          <div className="border border-border rounded-xl bg-card p-6 shadow-soft">
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
