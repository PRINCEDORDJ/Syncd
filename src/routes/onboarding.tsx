import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace-context";
import { completeUserOnboarding, createWorkspaceOnboarding } from "@/lib/workspace-onboarding";
import { BrandMark } from "@/components/BrandMark";
import { Loader2 } from "lucide-react";

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
    }
    fieldRef.current?.focus();
  }, [user, personalName]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    const trimmed = workspaceName.trim();
    if (!trimmed) {
      setError("Enter a workspace name.");
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
    <div className="min-h-dvh bg-background text-ink flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2">
          <BrandMark size={26} />
          <span className="font-semibold tracking-tight text-[15px] text-ink">Syncd</span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft sm:p-7">
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">Name your workspace</h1>

          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <Field
              label="Workspace name"
              value={workspaceName}
              onChange={setWorkspaceName}
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
      </div>
    </div>
  );
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
