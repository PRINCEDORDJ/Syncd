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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
