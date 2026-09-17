import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { createUniqueChannel } from "@/lib/realtime";
import { SidebarShell } from "@/components/workspace/SidebarShell";
import { type PlanTier } from "@/lib/plans";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WorkspacesSettingsPanel } from "@/components/settings/WorkspacesSettingsPanel";
import { ProfileSettingsPanel } from "@/components/settings/ProfileSettingsPanel";
import { LinkedInSettingsPanel } from "@/components/settings/LinkedInSettingsPanel";
import { BillingSettingsPanel } from "@/components/settings/BillingSettingsPanel";
import { TeamsSettingsPanel } from "@/components/settings/TeamsSettingsPanel";
import { AccountSettingsPanel } from "@/components/settings/AccountSettingsPanel";
import { DangerSettingsPanel } from "@/components/settings/DangerSettingsPanel";
import { SettingsSkeleton } from "@/components/skeletons/SettingsSkeleton";

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>) => ({
    linkedin_connected:
      search.linkedin_connected != null ? String(search.linkedin_connected) : undefined,
    linkedin_error:
      search.linkedin_error != null ? String(search.linkedin_error) : undefined,
    billing: search.billing != null ? String(search.billing) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Settings — Syncd" },
      { name: "description", content: "Manage your profile, voice, and LinkedIn connection." },
    ],
  }),
  component: SettingsGate,
});

interface SubscriptionRow {
  plan: PlanTier;
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  polar_customer_id: string | null;
}

function SettingsGate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", search: { redirect: "/settings" } });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return <SettingsSkeleton />;
  }
  return <SettingsPage />;
}

function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [linkedInBanner, setLinkedInBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [credits, setCredits] = useState<{
    subscription: number;
    topup: number;
    dailyUsed: number;
  } | null>(null);
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");

  const isStatusActive =
    sub?.status === "active" ||
    (sub?.status === "trialing" && (!sub?.trial_end || new Date(sub.trial_end) > new Date()));
  const notExpired = !sub?.current_period_end || new Date(sub.current_period_end) > new Date();
  const effectivePlan: PlanTier = isAdmin
    ? "teams"
    : (isStatusActive && notExpired ? (sub?.plan ?? "trial") : "trial");
  const effectiveStatus = isAdmin
    ? "active"
    : (isStatusActive && notExpired ? (sub?.status ?? "trialing") : (sub?.status ?? "expired"));

  // Handle OAuth/billing redirect banners
  useEffect(() => {
    if (search.linkedin_connected === "1") {
      setLinkedInBanner({ type: "success", text: "LinkedIn connected successfully." });
    } else if (search.linkedin_error) {
      setLinkedInBanner({
        type: "error",
        text: `LinkedIn connection failed: ${search.linkedin_error}`,
      });
    }
    if (search.billing === "success") {
      setLinkedInBanner({
        type: "success",
        text: "Payment received — your subscription will activate within a few seconds.",
      });
    }
  }, [search.linkedin_connected, search.linkedin_error, search.billing]);

  // Load subscription, roles, and credits
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: subRow }, { data: roles }] = await Promise.all([
        supabase
          .from("subscriptions")
          .select(
            "plan, status, trial_end, current_period_end, cancel_at_period_end, polar_customer_id",
          )
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id),
      ]);
      if (cancelled) return;
      setSub(subRow as SubscriptionRow | null);
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Realtime subscription refresh for billing state
  useEffect(() => {
    if (!user) return;
    const refresh = async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select(
          "plan, status, trial_end, current_period_end, cancel_at_period_end, polar_customer_id",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      setSub((data as SubscriptionRow | null) ?? null);
    };
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const channel = createUniqueChannel(`sub-settings-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      window.removeEventListener("focus", onFocus);
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Load credits
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let wsId: string | null = null;

    const load = async () => {
      if (!wsId) {
        const { data: memberWs } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        wsId = memberWs?.workspace_id ?? null;
      }
      if (!wsId || cancelled) return;

      const { data } = await supabase
        .from("user_credits")
        .select("subscription_credits, topup_credits, daily_credits_used")
        .eq("workspace_id", wsId)
        .maybeSingle();
      if (cancelled) return;
      setCredits({
        subscription: data?.subscription_credits ?? 0,
        topup: data?.topup_credits ?? 0,
        dailyUsed: data?.daily_credits_used ?? 0,
      });
    };
    void load();
    const channel = createUniqueChannel(`credits-settings-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_credits" },
        () => void load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading) {
    return <SettingsSkeleton />;
  }

  return (
    <SidebarShell mobileTitle="Settings">
      <div className="h-full min-h-0 w-full overflow-y-auto">

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-8 sm:mb-10">
          <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-2 sm:mb-3">
            Settings
          </p>
          <h1 className="text-2xl sm:text-3xl tracking-[-0.02em] font-semibold leading-tight">
            Account & integrations
          </h1>
        </div>

        {linkedInBanner && (
          <div
            className={`mb-6 px-4 py-3 rounded-md border text-[13px] ${
              linkedInBanner.type === "success"
                ? "bg-subtle border-border text-ink"
                : "bg-destructive/5 border-destructive/20 text-destructive"
            }`}
          >
            {linkedInBanner.text}
          </div>
        )}

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="mb-6 flex w-full overflow-x-auto no-scrollbar bg-subtle/60 p-1 rounded-lg h-auto justify-start">
            <TabsTrigger value="profile" className="text-[13px]">Profile</TabsTrigger>
            <TabsTrigger value="linkedin" className="text-[13px]">LinkedIn</TabsTrigger>
            <TabsTrigger value="billing" className="text-[13px]">Billing</TabsTrigger>
            <TabsTrigger value="workspaces" className="text-[13px]">Workspaces</TabsTrigger>
            <TabsTrigger value="team" className="text-[13px]">Teams</TabsTrigger>
            <TabsTrigger value="account" className="text-[13px]">Account</TabsTrigger>
            <TabsTrigger value="danger" className="text-[13px] data-[state=active]:text-destructive">Danger</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-0">
            {user && (
              <ProfileSettingsPanel
                user={user}
                effectivePlan={effectivePlan}
                isAdmin={isAdmin}
              />
            )}
          </TabsContent>

          <TabsContent value="linkedin" className="mt-0">
            {user && (
              <LinkedInSettingsPanel
                user={user}
                effectivePlan={effectivePlan}
                isAdmin={isAdmin}
              />
            )}
          </TabsContent>

          <TabsContent value="billing" className="mt-0">
            {user && (
              <BillingSettingsPanel
                user={user}
                effectivePlan={effectivePlan}
                effectiveStatus={effectiveStatus}
                isAdmin={isAdmin}
                sub={sub}
                credits={credits}
                billingInterval={billingInterval}
                onIntervalChange={setBillingInterval}
              />
            )}
          </TabsContent>

          <TabsContent value="workspaces" className="mt-0">
            <WorkspacesSettingsPanel />
          </TabsContent>

          <TabsContent value="team" className="mt-0">
            {user && (
              <TeamsSettingsPanel
                user={user}
                effectivePlan={effectivePlan}
                isAdmin={isAdmin}
              />
            )}
          </TabsContent>

          <TabsContent value="account" className="mt-0">
            {user && (
              <AccountSettingsPanel
                user={user}
                signOut={signOut}
              />
            )}
          </TabsContent>

          <TabsContent value="danger" className="mt-0">
            {user && (
              <DangerSettingsPanel
                user={user}
                signOut={signOut}
                navigate={navigate}
              />
            )}
          </TabsContent>
        </Tabs>

        <p className="mt-12 text-[13px] text-muted-foreground">
          ←{" "}
          <Link to="/app" className="hover:text-ink">
            Back to workspace
          </Link>
        </p>
      </main>
      </div>
    </SidebarShell>
  );
}
