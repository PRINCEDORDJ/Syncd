import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getTeamInvite, acceptTeamInvite, type TeamInvitePreview } from "@/lib/workspace-access";
import { BrandMark } from "@/components/BrandMark";

export const Route = createFileRoute("/invite")({
  validateSearch: z.object({
    token: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Team invite — Syncd" },
      { name: "description", content: "You've been invited to join a team on Syncd." },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const token = search.token;

  const [preview, setPreview] = useState<TeamInvitePreview | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!loading && !user && token) {
      navigate({ to: "/login", search: { redirect: `/invite?token=${token}` }, replace: true });
    }
  }, [loading, user, token, navigate]);

  useEffect(() => {
    if (loading || !user || !token) return;
    let cancelled = false;
    setFetching(true);
    setFetchError(null);
    getTeamInvite(token)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch((e) => {
        if (!cancelled) {
          setFetchError(e instanceof Error ? e.message : "Could not load this invite.");
        }
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, user, token]);

  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      await acceptTeamInvite(token);
      setAccepted(true);
    } catch (e) {
      setAcceptError(e instanceof Error ? e.message : "Could not accept this invite.");
    } finally {
      setAccepting(false);
    }
  }

  async function handleSwitchAccount() {
    await supabase.auth.signOut();
    navigate({ to: "/login", search: { redirect: `/invite?token=${token ?? ""}` }, replace: true });
  }

  return (
    <div className="min-h-dvh bg-background text-ink flex flex-col">
      <header className="border-b border-border">
        <div className="px-6 md:px-8 h-14 max-w-7xl w-full mx-auto flex items-center">
          <Link to="/" className="inline-flex items-center gap-2 group">
            <BrandMark size={20} />
            <span className="font-semibold tracking-tight text-[15px] text-ink">Syncd</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-3">
              Team invite
            </p>
            <h1 className="text-3xl tracking-[-0.02em] font-semibold leading-tight">
              {accepted ? "You're in!" : "Join your team"}
            </h1>
          </div>

          <div className="border border-border rounded-xl bg-card p-6 shadow-soft">
            {!token ? (
              <StateBlock
                message="This invite link is incomplete. Ask your team owner to send it again."
                actionLabel="Go to Syncd"
                onAction={() => navigate({ to: "/app", replace: true })}
              />
            ) : loading || (fetching && !preview && !fetchError) ? (
              <p className="text-[14px] text-muted-foreground">Loading invite…</p>
            ) : fetchError ? (
              <StateBlock message={fetchError} actionLabel="Go to Syncd" onAction={() => navigate({ to: "/app", replace: true })} />
            ) : accepted || preview?.accepted ? (
              <div className="flex flex-col gap-4">
                <p className="text-[14px] text-muted-foreground leading-relaxed">
                  You're a {preview?.role ?? "member"} of{" "}
                  <span className="text-ink font-medium">{preview?.team_name ?? "your team"}</span>.
                </p>
                <PrimaryButton onClick={() => navigate({ to: "/app", replace: true })}>
                  Open your workspace
                </PrimaryButton>
              </div>
            ) : !preview?.found ? (
              <StateBlock
                message="This invite link is no longer valid. It may have been revoked or already used."
                actionLabel="Go to Syncd"
                onAction={() => navigate({ to: "/app", replace: true })}
              />
            ) : !preview.email_matches ? (
              <div className="flex flex-col gap-4">
                <p className="text-[14px] text-muted-foreground leading-relaxed">
                  This invite was sent to{" "}
                  <span className="text-ink font-medium">{preview.email}</span>, but you're signed in as{" "}
                  <span className="text-ink font-medium">{user?.email}</span>.
                </p>
                <PrimaryButton onClick={handleSwitchAccount}>Switch account</PrimaryButton>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/app", replace: true })}
                  className="text-[13px] text-muted-foreground hover:text-ink transition-colors"
                >
                  Continue to my workspace instead
                </button>
              </div>
            ) : preview.expired ? (
              <StateBlock
                message="This invite has expired. Ask your team owner to send a new one."
                actionLabel="Go to Syncd"
                onAction={() => navigate({ to: "/app", replace: true })}
              />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <p className="text-[14px] text-muted-foreground">
                    <span className="text-ink font-medium">{user?.email}</span> invited you to join
                  </p>
                  <p className="text-xl font-semibold tracking-[-0.01em]">{preview.team_name}</p>
                  <p className="text-[13px] text-muted-foreground">
                    as{" "}
                    <span className="inline-flex items-center rounded-full border border-border bg-subtle px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-ink">
                      {preview.role}
                    </span>
                    {" "}— {preview.role === "viewer" ? "read-only access to shared drafts" : "full access to shared drafts"}
                  </p>
                </div>
                {acceptError && (
                  <div className="text-[13px] text-destructive bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2.5">
                    {acceptError}
                  </div>
                )}
                <PrimaryButton onClick={handleAccept} disabled={accepting}>
                  {accepting ? "Joining…" : "Accept invite"}
                </PrimaryButton>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function StateBlock({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] text-muted-foreground leading-relaxed">{message}</p>
      <PrimaryButton onClick={onAction}>{actionLabel}</PrimaryButton>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-10 rounded-md bg-ink text-surface text-[14px] font-medium hover:bg-ink/90 disabled:opacity-60 transition-colors"
    >
      {children}
    </button>
  );
}
