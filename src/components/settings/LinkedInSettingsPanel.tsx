import { useEffect, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Section } from "./ui-primitives";
import { PLAN_LIMITS, type PlanTier } from "@/lib/plans";
import { Loader2, Plus, AlertCircle } from "lucide-react";

interface LinkedInConnection {
  id: string;
  linkedin_name: string | null;
  linkedin_picture_url: string | null;
  linkedin_member_urn: string;
  expires_at: string;
  scope: string | null;
}

export function LinkedInSettingsPanel({
  user,
  effectivePlan,
  isAdmin,
}: {
  user: User;
  effectivePlan: PlanTier;
  isAdmin: boolean;
}) {
  const [connections, setConnections] = useState<LinkedInConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingLinkedIn, setConnectingLinkedIn] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<LinkedInConnection | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const maxAccounts = PLAN_LIMITS[effectivePlan].maxLinkedInAccounts;
  const atLimit = !isAdmin && connections.length >= maxAccounts;

  const loadConnections = useCallback(async () => {
    const { data } = await supabase
      .from("linkedin_connections")
      .select("id, linkedin_name, linkedin_picture_url, linkedin_member_urn, expires_at, scope")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    // Filter out expired connections client-side
    const now = Date.now();
    const active = (data ?? []).filter(
      (c) => new Date(c.expires_at).getTime() > now,
    );
    setConnections(active);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  // Realtime updates for connection changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`linkedin-conn-multi-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "linkedin_connections",
          filter: `user_id=eq.${user.id}`,
        },
        () => void loadConnections(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadConnections]);

  async function connectLinkedIn() {
    setConnectingLinkedIn(true);
    setBanner(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setConnectingLinkedIn(false);
      setBanner({ type: "error", text: "Session expired — please sign in again." });
      return;
    }
    const resp = await fetch("/api/linkedin/start", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ redirect_to: "/settings" }),
    });
    const data = (await resp.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!resp.ok || !data.url) {
      setBanner({ type: "error", text: data.error ?? "Failed to start OAuth." });
      setConnectingLinkedIn(false);
      return;
    }
    window.location.href = data.url;
  }

  async function disconnectLinkedIn(conn: LinkedInConnection) {
    setDisconnectingId(conn.id);
    setBanner(null);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setDisconnectingId(null);
      setBanner({ type: "error", text: "Session expired — please sign in again." });
      return;
    }
    try {
      const resp = await fetch("/api/linkedin/disconnect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ connection_id: conn.id }),
      });
      if (resp.ok) {
        setConnections((prev) => prev.filter((c) => c.id !== conn.id));
        setBanner({ type: "success", text: `${conn.linkedin_name ?? "Account"} disconnected.` });
      } else {
        const j = await resp.json().catch(() => ({}));
        setBanner({ type: "error", text: j.error ?? "Failed to disconnect." });
      }
    } catch {
      setBanner({ type: "error", text: "Connection error. Please try again." });
    } finally {
      setDisconnectingId(null);
    }
  }

  if (loading) {
    return (
      <Section title="LinkedIn connection" subtitle="Manage LinkedIn accounts linked to Syncd.">
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-4">
          <Loader2 className="size-4 animate-spin" />
          Loading connections…
        </div>
      </Section>
    );
  }

  return (
    <>
      <Section
        title="LinkedIn connection"
        subtitle="Authorize LinkedIn accounts to publish drafts straight from the workspace."
      >
        {banner && (
          <div
            className={`px-3 py-2 rounded-md border text-[13px] ${
              banner.type === "success"
                ? "bg-subtle border-border text-ink"
                : "bg-destructive/5 border-destructive/20 text-destructive"
            }`}
          >
            {banner.text}
          </div>
        )}

        {/* Connection limit info */}
        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
          <span>
            {connections.length} of {isAdmin ? "∞" : maxAccounts} account{maxAccounts > 1 ? "s" : ""} connected
          </span>
          {atLimit && !isAdmin && (
            <Link to="/pricing" className="text-ink underline font-medium">
              Upgrade for more
            </Link>
          )}
        </div>

        {/* Existing connections */}
        {connections.map((conn) => {
          const expiresAt = new Date(conn.expires_at);
          const daysUntilExpiry = Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000);
          const isExpiringSoon = daysUntilExpiry <= 7;
          return (
            <div
              key={conn.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-4 border border-border rounded-md bg-subtle/40"
            >
              <div className="flex items-center gap-3 min-w-0">
                {!!conn.linkedin_picture_url ? (
                  <img
                    src={conn.linkedin_picture_url}
                    alt={conn.linkedin_name ?? "LinkedIn profile"}
                    className="size-10 rounded-full border border-border"
                  />
                ) : (
                  <div className="size-10 rounded-full bg-ink text-surface flex items-center justify-center text-sm font-semibold">
                    {conn.linkedin_name?.[0] ?? "?"}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-ink truncate">
                    {conn.linkedin_name ?? "LinkedIn member"}
                  </div>
                  {isExpiringSoon ? (
                    <div className="text-[11px] font-mono text-amber-600 dark:text-amber-400 font-semibold truncate">
                      Expires in {daysUntilExpiry}d — reconnect soon
                    </div>
                  ) : (
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      Token expires {expiresAt.toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {isExpiringSoon && (
                  <button
                    type="button"
                    onClick={connectLinkedIn}
                    disabled={connectingLinkedIn}
                    className="h-9 px-3 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-60 flex-1 sm:flex-none"
                  >
                    {connectingLinkedIn ? "Redirecting…" : "Reconnect"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(conn)}
                  disabled={disconnectingId === conn.id}
                  className="h-9 px-3 rounded-md border border-border text-[13px] text-ink hover:bg-subtle flex-1 sm:flex-none disabled:opacity-60"
                >
                  {disconnectingId === conn.id ? "Disconnecting…" : "Disconnect"}
                </button>
              </div>
            </div>
          );
        })}

        {/* Not connected / Add another */}
        {connections.length === 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-4 border border-border rounded-md">
            <div className="min-w-0">
              <div className="text-[14px] text-ink font-medium">Not connected</div>
              <div className="text-[12px] text-muted-foreground mt-0.5">
                Required to publish posts directly from Syncd.
              </div>
            </div>
            <button
              type="button"
              onClick={connectLinkedIn}
              disabled={connectingLinkedIn}
              className="h-9 px-4 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-60 inline-flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              {connectingLinkedIn ? "Redirecting…" : "Connect LinkedIn"}
              <span aria-hidden>→</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={connectLinkedIn}
            disabled={connectingLinkedIn || atLimit}
            className="h-9 px-4 rounded-md border border-border text-[13px] text-ink hover:bg-subtle disabled:opacity-50 inline-flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            {connectingLinkedIn ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Redirecting…
              </>
            ) : (
              <>
                <Plus className="size-3.5" />
                Add another account
              </>
            )}
          </button>
        )}

        {atLimit && !isAdmin && (
          <div className="flex items-start gap-2 p-3 rounded-md border border-border bg-subtle/40 text-[12px] text-muted-foreground">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>
              You've reached the {maxAccounts} account limit on the {effectivePlan === "trial" ? "Free" : "Studio"} plan.{" "}
              <Link to="/pricing" className="text-ink underline font-medium">Upgrade to Teams</Link>{" "}
              for up to 10 LinkedIn accounts.
            </span>
          </div>
        )}
      </Section>

      <ConfirmDialog
        open={!!confirmDisconnect}
        onOpenChange={(open) => { if (!open) setConfirmDisconnect(null); }}
        title="Disconnect LinkedIn?"
        description={`You won't be able to publish directly as ${confirmDisconnect?.linkedin_name ?? "this account"} until you reconnect.`}
        confirmText="Disconnect"
        variant="destructive"
        onConfirm={() => {
          const conn = confirmDisconnect;
          setConfirmDisconnect(null);
          if (conn) void disconnectLinkedIn(conn);
        }}
      />
    </>
  );
}
