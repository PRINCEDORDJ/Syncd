import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace-context";
import { completeUserOnboarding, createWorkspaceOnboarding } from "@/lib/workspace-onboarding";
import { BrandMark } from "@/components/BrandMark";
import { Loader2, Sparkles, LayoutGrid, Users } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your workspace \u2014 Syncd" },
      {
        name: "description",
        content: "Create your workspace to finish onboarding.",
      },
    ],
  }),
  component: OnboardingRoute,
});

/**
 * Resolve a human-friendly label for the current user, mirroring the
 * precedence used in ProfileSettingsPanel and the profiles DB trigger:
 * display_name → full_name → name → email prefix → null.
 */
function resolveUserLabel(user: {
  user_metadata?: Record<string, unknown>;
  email?: string | null;
}): string | null {
  const meta = user.user_metadata ?? {};
  const fromMeta = [meta.display_name, meta.full_name, meta.name].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  if (fromMeta) return fromMeta.trim();
  const emailPrefix = user.email?.split("@")[0]?.trim();
  return emailPrefix || null;
}

function OnboardingRoute() {
  const { user, loading, onboarding, refreshOnboarding } = useAuth();
  const { setActiveWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [workspaceName, setWorkspaceName] = useState("");
  const [nameMode, setNameMode] = useState<"personal" | "custom">("personal");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  const userLabel = user ? resolveUserLabel(user) : null;
  const personalName = userLabel ? `${userLabel}'s workspace` : "";

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: "/onboarding" } });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!loading && user && (onboarding?.workspace_count ?? 0) > 0) {
      navigate({ to: "/app", replace: true });
    }
  }, [loading, user, onboarding?.onboarding_status, onboarding?.workspace_count, navigate]);

  useEffect(() => {
    if (!user) return;
    if (personalName) {
      // Pre-fill with the personal suggestion, but never clobber an
      // already-entered value.
      setWorkspaceName((prev) => prev || personalName);
    } else {
      // Nothing to suggest — the user must type their own name.
      setNameMode("custom");
    }
  }, [user, personalName]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    const trimmed = workspaceName.trim();
    if (!trimmed) {
      setError("Enter a workspace name, or pick the suggestion with your name.");
      return;
    }
    if (trimmed.length > 80) {
      setError("Workspace name must be 80 characters or fewer.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { workspace } = await createWorkspaceOnboarding(user.id, {
        workspaceName: trimmed,
      });
      await completeUserOnboarding();
      setActiveWorkspace(workspace);
      await refreshOnboarding();
      navigate({ to: "/app", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to finish setup.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-dvh bg-background text-ink flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <BrandMark size={30} />
          <div className="inline-flex items-center gap-2 text-[13px] font-mono text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading setup…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,_rgba(0,0,0,0.04),_transparent_36%),linear-gradient(180deg,_rgba(255,255,255,0.92),_rgba(248,249,250,1))] text-ink">
      <div className="mx-auto grid min-h-dvh max-w-7xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex flex-col justify-between px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="flex items-center gap-2">
            <BrandMark size={22} />
            <span className="font-semibold tracking-tight text-[15px] text-ink">Syncd</span>
          </div>

          <div className="max-w-xl py-10 lg:py-0">
            <p className="mb-3 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              Workspace setup
            </p>
            <h1 className="max-w-lg text-4xl sm:text-5xl tracking-[-0.04em] font-semibold leading-[0.95]">
              Create the workspace where your team will work.
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-7 text-muted-foreground">
              We'll create a workspace and unlock access for future invites. Your drafts live
              directly inside the workspace — no extra nesting needed.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <Feature
                icon={LayoutGrid}
                title="Workspace"
                text="Shared container for your drafts and team access."
              />
              <Feature
                icon={Users}
                title="Members"
                text="Invite collaborators with role-based permissions."
              />
              <Feature
                icon={Sparkles}
                title="Drafts"
                text="Write, refine, and publish posts directly."
              />
            </div>

            <div className="mt-8 rounded-2xl border border-border bg-card/90 p-4 sm:p-5 shadow-soft">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                <span className="rounded-full border border-border bg-subtle px-2 py-0.5 font-mono uppercase tracking-[0.12em]">
                  Signed in
                </span>
                <span>{user.email}</span>
                {onboarding?.workspace_count ? (
                  <span className="rounded-full border border-border bg-subtle px-2 py-0.5 font-mono uppercase tracking-[0.12em]">
                    {onboarding.workspace_count} workspace
                    {onboarding.workspace_count === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <p className="mt-8 text-[12px] text-muted-foreground">
            Need to change something later? You can manage access from Settings.
          </p>
        </section>

        <section className="flex items-center px-6 py-8 sm:px-8 lg:px-10 lg:py-12">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-xl">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              Step 1 of 1
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Name your workspace</h2>
            <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
              Use your name or pick anything you like — this is the root space your teammates will
              be invited into.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div className="flex flex-wrap gap-2">
                {personalName ? (
                  <button
                    type="button"
                    onClick={() => {
                      setNameMode("personal");
                      setWorkspaceName(personalName);
                    }}
                    className={chipClass(nameMode === "personal")}
                    title={personalName}
                  >
                    <Users className="size-3.5 shrink-0" />
                    <span className="max-w-[200px] truncate">{personalName}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setNameMode("custom");
                    setWorkspaceName("");
                    fieldRef.current?.focus();
                  }}
                  className={chipClass(nameMode === "custom")}
                >
                  <Sparkles className="size-3.5 shrink-0" />
                  Choose my own
                </button>
              </div>

              <Field
                label="Workspace name"
                value={workspaceName}
                onChange={(v) => {
                  setNameMode(personalName && v === personalName ? "personal" : "custom");
                  setWorkspaceName(v);
                }}
                placeholder="Marketing team"
                autoComplete="organization"
                inputRef={fieldRef}
              />

              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-[13px] text-destructive">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[14px] font-medium text-surface transition-colors hover:bg-ink/90 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                {submitting ? "Creating workspace…" : "Create workspace"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof LayoutGrid;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/80 p-4">
      <Icon className="size-4 text-muted-foreground" />
      <h3 className="mt-3 text-[14px] font-medium">{title}</h3>
      <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}

function chipClass(active: boolean): string {
  return [
    "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
    active
      ? "border-ink bg-ink text-surface"
      : "border-border bg-background text-ink hover:border-ink/40",
  ].join(" ");
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="h-11 rounded-xl border border-border bg-background px-3 text-[14px] text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-ink/15"
      />
    </label>
  );
}
