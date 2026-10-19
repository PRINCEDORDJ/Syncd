import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { hasAnyWorkspaceAccess } from "@/lib/workspace-access";

/**
 * Gate for signed-in app routes: bounces users without access to any
 * workspace to /onboarding. Covers new signups (onboarding_status pending)
 * and users who deleted their last workspace (status complete) alike. Users
 * who are only members of someone else's workspace are allowed through.
 *
 * When the onboarding summary is missing or unknown (RPC failure), access is
 * probed directly and resolves fail-open; a successful probe also heals the
 * stale summary via refreshOnboarding.
 *
 * Returns true when the caller may render the protected content; else it
 * should show its skeleton (navigation happens inside the hook).
 */
export function useWorkspaceGate(loginRedirect: string): boolean {
  const { user, loading, onboarding, refreshOnboarding } = useAuth();
  const navigate = useNavigate();
  const [fallbackAccess, setFallbackAccess] = useState<boolean | null>(null);
  const userId = user?.id;

  useEffect(() => {
    setFallbackAccess(null);
  }, [userId]);

  useEffect(() => {
    if (!loading && !userId) {
      navigate({ to: "/login", search: { redirect: loginRedirect } });
    }
  }, [loading, userId, navigate, loginRedirect]);

  const status = onboarding?.onboarding_status;
  const uncertain = !!userId && (status === "unknown" || status === undefined);

  useEffect(() => {
    if (!uncertain || !userId) return;
    let cancelled = false;
    void hasAnyWorkspaceAccess(userId)
      .then((ok) => {
        if (cancelled) return;
        setFallbackAccess(ok);
        if (ok) void refreshOnboarding();
      })
      .catch(() => {
        // Never lock users out on a transient probe failure
        if (!cancelled) setFallbackAccess(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uncertain, userId, refreshOnboarding]);

  useEffect(() => {
    if (loading || !userId) return;
    if (uncertain && fallbackAccess === null) return;
    const blocked = uncertain ? !fallbackAccess : (onboarding?.workspace_count ?? 0) === 0;
    if (blocked) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [
    loading,
    userId,
    uncertain,
    fallbackAccess,
    onboarding?.onboarding_status,
    onboarding?.workspace_count,
    navigate,
  ]);

  if (!userId || loading) return false;
  if (uncertain) return fallbackAccess === true;
  return (onboarding?.workspace_count ?? 0) > 0;
}
