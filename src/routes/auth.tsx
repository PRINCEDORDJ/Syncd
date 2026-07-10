import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { BrandMark } from "@/components/BrandMark";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Signing you in — SocialSync" },
      { name: "description", content: "Completing sign-in to SocialSync." },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (user) {
      const dest = redirect && redirect.startsWith("/") ? redirect : "/app";
      navigate({ to: dest, replace: true });
      return;
    }
    const t = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [user, loading, navigate, redirect]);

  useEffect(() => {
    if (timedOut && !user) {
      navigate({ to: "/login", search: { redirect: "/app" } });
    }
  }, [timedOut, user, navigate]);

  return (
    <div className="min-h-dvh bg-background text-ink flex flex-col items-center justify-center gap-4 px-6">
      <BrandMark size={28} />
      <p className="text-[13px] font-mono text-muted-foreground">
        {timedOut ? "Redirecting…" : "Signing you in…"}
      </p>
    </div>
  );
}
