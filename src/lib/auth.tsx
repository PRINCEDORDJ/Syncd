import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  loadPostSignupContext,
  type PostSignupContext,
} from "@/lib/workspace-onboarding";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  onboarding: PostSignupContext | null;
  refreshOnboarding: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState<PostSignupContext | null>(null);

  const refreshOnboarding = useCallback(async () => {
    if (!session?.user) {
      setOnboarding(null);
      return;
    }

    try {
      const ctx = await loadPostSignupContext();
      setOnboarding(ctx);
    } catch {
      setOnboarding({
        onboarding_status: "unknown",
        workspace_count: 0,
      });
    }
  }, [session?.user]);

  useEffect(() => {
    let active = true;

    // Subscribe FIRST, then fetch and validate the existing session. After a
    // Supabase project migration, localStorage can still contain a JWT issued
    // by the old project. getSession() only reads that cached value; getUser()
    // verifies it against the currently configured Supabase project.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (active) {
        setSession(newSession);
        setLoading(false);
      }
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      const cachedSession = data.session;

      if (!cachedSession) {
        if (active) setLoading(false);
        return;
      }

      const { error } = await supabase.auth.getUser(cachedSession.access_token);
      if (error) {
        // Clear only this browser's cached session. The token may belong to a
        // project that no longer exists, so a remote sign-out is unnecessary.
        await supabase.auth.signOut({ scope: "local" });
        if (active) setSession(null);
      } else if (active) {
        setSession(cachedSession);
      }
      if (active) setLoading(false);
    })();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setOnboarding(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      // Sync Google OAuth avatar/name to profile if needed
      await syncUserProfileMetadata(session.user);

      try {
        const ctx = await loadPostSignupContext();
        if (!cancelled) setOnboarding(ctx);
      } catch {
        if (!cancelled) {
          setOnboarding({
            onboarding_status: "unknown",
            workspace_count: 0,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signOut,
      onboarding,
      refreshOnboarding,
    }),
    [session, loading, signOut, onboarding, refreshOnboarding],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export async function syncUserProfileMetadata(user: User): Promise<void> {
  const meta = user.user_metadata;
  if (!meta) return;

  const avatarUrl =
    (meta.avatar_url as string | undefined) ||
    (meta.picture as string | undefined) ||
    null;
  const displayName =
    (meta.display_name as string | undefined) ||
    (meta.full_name as string | undefined) ||
    (meta.name as string | undefined) ||
    null;

  if (!avatarUrl && !displayName) return;

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("avatar_url, display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    const updates: { user_id: string; avatar_url?: string | null; display_name?: string | null } = {
      user_id: user.id,
    };
    let needsUpdate = false;

    if (!profile) {
      updates.display_name = displayName || user.email?.split("@")[0] || "User";
      if (avatarUrl) updates.avatar_url = avatarUrl;
      needsUpdate = true;
    } else {
      if (!profile.avatar_url && avatarUrl) {
        updates.avatar_url = avatarUrl;
        needsUpdate = true;
      }
      if (!profile.display_name && displayName) {
        updates.display_name = displayName;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      await supabase.from("profiles").upsert(updates, { onConflict: "user_id" });
    }
  } catch {
    // Non-blocking sync safeguard
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
