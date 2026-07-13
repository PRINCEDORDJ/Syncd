import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SiteNav } from "@/components/SiteNav";
import { PLAN_LABELS, PLAN_LIMITS, type PlanTier } from "@/lib/plans";
import { uploadAvatar as uploadAvatarFn, removeAvatar as removeAvatarFn } from "@/lib/avatar-upload";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ConfirmDialog";

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
      { title: "Settings — SocialSync" },
      { name: "description", content: "Manage your profile, voice, and LinkedIn connection." },
    ],
  }),
  component: SettingsGate,
});

function SettingsGate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", search: { redirect: "/settings" } });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-dvh bg-background text-ink flex items-center justify-center">
        <span className="text-[13px] font-mono text-muted-foreground">
          Loading…
        </span>
      </div>
    );
  }
  return <SettingsPage />;
}

interface Profile {
  display_name: string | null;
  avatar_url: string | null;
  voice_notes: string | null;
}

interface LinkedInConnection {
  linkedin_name: string | null;
  linkedin_picture_url: string | null;
  linkedin_member_urn: string;
  expires_at: string;
  scope: string | null;
}

interface SubscriptionRow {
  plan: PlanTier;
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  polar_customer_id: string | null;
}

function SettingsPage() {
  const { user, session, signOut } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [conn, setConn] = useState<LinkedInConnection | null>(null);
  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [billingMsg, setBillingMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable form state
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [voiceNotes, setVoiceNotes] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  // Voice notes dictation
  const [recording, setRecording] = useState(false);
  const [voiceMsg, setVoiceMsg] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Account
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");

  // LinkedIn flow
  const [connectingLinkedIn, setConnectingLinkedIn] = useState(false);
  const [disconnectingLinkedIn, setDisconnectingLinkedIn] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<"studio" | "teams" | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [linkedInBanner, setLinkedInBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Confirmation dialogs
  const [confirmRemoveAvatar, setConfirmRemoveAvatar] = useState(false);
  const [confirmDisconnectLI, setConfirmDisconnectLI] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

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
      setBillingMsg(
        "Payment received — your subscription will activate within a few seconds.",
      );
    }
  }, [search.linkedin_connected, search.linkedin_error, search.billing]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: prof }, { data: linkedin }, { data: subRow }, { data: roles }] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, avatar_url, voice_notes")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("linkedin_connections")
          .select("linkedin_name, linkedin_picture_url, linkedin_member_urn, expires_at, scope")
          .eq("user_id", user.id)
          .maybeSingle(),
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
      const p = prof ?? { display_name: null, avatar_url: null, voice_notes: null };
      setProfile(p);
      setDisplayName(p.display_name ?? "");
      setAvatarUrl(p.avatar_url ?? "");
      setVoiceNotes(p.voice_notes ?? "");
      setConn(linkedin ?? null);
      setSub(subRow as SubscriptionRow | null);
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Live-refresh subscription on focus + realtime updates so the plan
  // panel reflects the latest billing state without a manual reload.
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
    const channel = supabase
      .channel(`sub-${user.id}`)
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

  async function uploadAvatar(file: File) {
    if (!user) return;
    setUploadingAvatar(true);
    setProfileMsg(null);
    try {
      const { url } = await uploadAvatarFn(user.id, file);
      setAvatarUrl(url);
      setProfile((prev) => ({
        display_name: prev?.display_name ?? null,
        voice_notes: prev?.voice_notes ?? null,
        avatar_url: url,
      }));
      setProfileMsg("Avatar updated.");
    } catch (e) {
      setProfileMsg(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function removeAvatar() {
    if (!user) return;
    setUploadingAvatar(true);
    setProfileMsg(null);
    try {
      await removeAvatarFn(user.id);
      setAvatarUrl("");
      setProfile((prev) => ({
        display_name: prev?.display_name ?? null,
        voice_notes: prev?.voice_notes ?? null,
        avatar_url: null,
      }));
      setProfileMsg("Avatar removed.");
    } catch (e) {
      setProfileMsg(e instanceof Error ? e.message : "Failed.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  function toggleDictation() {
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceMsg("Voice dictation isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
      }
      if (transcript) {
        setVoiceNotes((prev) =>
          prev ? `${prev.replace(/\s+$/, "")} ${transcript.trim()}` : transcript.trim(),
        );
      }
    };
    rec.onerror = (e: any) => {
      setVoiceMsg(`Mic error: ${e.error ?? "unknown"}`);
      setRecording(false);
    };
    rec.onend = () => setRecording(false);
    recognitionRef.current = rec;
    setVoiceMsg(null);
    setRecording(true);
    try {
      rec.start();
    } catch {
      setRecording(false);
    }
  }

  async function openBillingPortal() {
    setOpeningPortal(true);
    setBillingMsg(null);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setBillingMsg("Session expired — please sign in again.");
      setOpeningPortal(false);
      return;
    }
    const resp = await fetch("/api/polar/portal", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await resp.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (!resp.ok || !data.url) {
      setBillingMsg(data.error ?? "Failed to open billing portal.");
      setOpeningPortal(false);
      return;
    }
    window.location.href = data.url;
  }

  async function startCheckout(plan: "studio" | "teams") {
    setCheckoutError(null);
    setCheckoutPlan(plan);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setCheckoutError("Session expired — please sign in again.");
      setCheckoutPlan(null);
      return;
    }
    const resp = await fetch("/api/polar/checkout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = (await resp.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!resp.ok || !data.url) {
      setCheckoutError(data.error ?? "Failed to start checkout.");
      setCheckoutPlan(null);
      return;
    }
    window.location.href = data.url;
  }

  async function saveProfile() {
    if (!user) return;
    setSavingProfile(true);
    setProfileMsg(null);
    const { error } = await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        display_name: displayName || null,
        avatar_url: avatarUrl || null,
        voice_notes: voiceNotes || null,
      },
      { onConflict: "user_id" },
    );
    setSavingProfile(false);
    if (error) {
      setProfileMsg(`Failed to save: ${error.message}`);
    } else {
      setProfileMsg("Saved.");
      setProfile({
        display_name: displayName || null,
        avatar_url: avatarUrl || null,
        voice_notes: voiceNotes || null,
      });
    }
  }

  async function changePassword() {
    setSavingPassword(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      setPwMsg(`Failed: ${error.message}`);
    } else {
      setPwMsg("Password updated.");
      setNewPassword("");
    }
  }

  async function connectLinkedIn() {
    setConnectingLinkedIn(true);
    setLinkedInBanner(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setConnectingLinkedIn(false);
      setLinkedInBanner({ type: "error", text: "Session expired — please sign in again." });
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
      setLinkedInBanner({ type: "error", text: data.error ?? "Failed to start OAuth." });
      setConnectingLinkedIn(false);
      return;
    }
    window.location.href = data.url;
  }

  async function disconnectLinkedIn() {
    if (!session?.access_token) {
      setLinkedInBanner({ type: "error", text: "Session expired — please sign in again." });
      return;
    }

    setDisconnectingLinkedIn(true);
    setLinkedInBanner(null);

    try {
      const resp = await fetch("/api/linkedin/disconnect", {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
      });

      if (resp.ok) {
        setConn(null);
        setLinkedInBanner({ type: "success", text: "LinkedIn disconnected successfully." });
      } else {
        const j = await resp.json().catch(() => ({}));
        setLinkedInBanner({ type: "error", text: j.error ?? "Failed to disconnect." });
      }
    } catch (err) {
      setLinkedInBanner({ type: "error", text: "Connection error. Please try again." });
    } finally {
      setDisconnectingLinkedIn(false);
    }
  }

  async function deleteAccount() {
    if (!user || confirmDelete !== "DELETE") return;
    setDeleting(true);
    // Best-effort cleanup of user-owned rows; auth user removal requires admin —
    // we sign out and the data stays orphaned-but-protected by RLS.
    await supabase.from("drafts").delete().eq("user_id", user.id);
    await supabase.from("linkedin_connections").delete().eq("user_id", user.id);
    await supabase.from("profiles").delete().eq("user_id", user.id);
    await signOut();
    navigate({ to: "/" });
  }

  if (loading || !profile) {
    return (
      <div className="min-h-dvh bg-background text-ink flex flex-col">
        <SiteNav />
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[13px] font-mono text-muted-foreground">
            Loading settings…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background text-ink">
      <SiteNav />

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
            <TabsTrigger value="account" className="text-[13px]">Account</TabsTrigger>
            <TabsTrigger value="danger" className="text-[13px] data-[state=active]:text-destructive">Danger</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-0">
        <Section title="Profile" subtitle="How you appear inside SocialSync.">
          <Field label="Display name">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jane Cooper"
              className="h-10 w-full px-3 rounded-md border border-border bg-card text-[14px] focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink"
            />
          </Field>
          <Field label="Avatar" hint="Click your avatar to view, upload, or change it (PNG/JPG, up to 5MB).">
            <div className="flex items-center gap-4">
              <Popover open={avatarMenuOpen} onOpenChange={setAvatarMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Avatar actions"
                    disabled={uploadingAvatar}
                    className="relative size-16 rounded-full overflow-hidden border border-border hover:ring-2 hover:ring-ink/20 transition disabled:opacity-60"
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Your avatar"
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="size-full bg-subtle flex items-center justify-center text-[16px] font-semibold text-muted-foreground">
                        {(displayName || user?.email || "?")[0]?.toUpperCase()}
                      </div>
                    )}
                    {uploadingAvatar && (
                      <div className="absolute inset-0 bg-background/70 flex items-center justify-center text-[11px] font-mono">
                        …
                      </div>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-48 p-1">
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarMenuOpen(false);
                        setViewerOpen(true);
                      }}
                      className="w-full text-left px-3 py-2 rounded-md text-[13px] hover:bg-subtle"
                    >
                      View photo
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      avatarFileRef.current?.click();
                    }}
                    className="w-full text-left px-3 py-2 rounded-md text-[13px] hover:bg-subtle"
                  >
                    {avatarUrl ? "Change photo" : "Upload photo"}
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarMenuOpen(false);
                        setConfirmRemoveAvatar(true);
                      }}
                      className="w-full text-left px-3 py-2 rounded-md text-[13px] text-destructive hover:bg-destructive/10"
                    >
                      Remove photo
                    </button>
                  )}
                </PopoverContent>
              </Popover>
              <input
                ref={avatarFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadAvatar(f);
                  e.target.value = "";
                }}
              />
              <div className="text-[12px] text-muted-foreground">
                {uploadingAvatar ? "Uploading…" : "Click the avatar for options."}
              </div>
            </div>
            <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
              <DialogContent className="max-w-[90vw] sm:max-w-2xl bg-background p-2 sm:p-4">
                <DialogTitle className="sr-only">Profile photo</DialogTitle>
                {avatarUrl && (
                  <img
                    src={avatarUrl}
                    alt="Profile photo"
                    className="w-full max-h-[80vh] object-contain rounded-md"
                  />
                )}
              </DialogContent>
            </Dialog>
          </Field>
          <Field
            label="Voice notes"
            hint="Free-text notes the AI will read before every generation. Hedge words you avoid, examples you reuse, your point of view."
          >
            <div className="flex flex-col gap-2">
              <textarea
                value={voiceNotes}
                onChange={(e) => setVoiceNotes(e.target.value)}
                placeholder="I write in short paragraphs. I avoid the words 'leverage' and 'unlock'. My recurring theme is…"
                rows={5}
                className="w-full px-3 py-2.5 rounded-md border border-border bg-card text-[14px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink resize-none"
              />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[12px] text-muted-foreground">
                  {recording
                    ? "Listening… speak naturally, then click Stop."
                    : voiceMsg ?? `${voiceNotes.length} characters`}
                </div>
                <div className="flex items-center gap-2">
                  {voiceNotes && !recording && (
                    <button
                      type="button"
                      onClick={() => setVoiceNotes("")}
                      className="h-8 px-3 rounded-md border border-border text-[12px] text-ink hover:bg-subtle"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={toggleDictation}
                    className={`h-8 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 ${
                      recording
                        ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        : "bg-ink text-surface hover:bg-ink/90"
                    }`}
                  >
                    <span
                      className={`size-2 rounded-full ${
                        recording ? "bg-current animate-pulse" : "bg-current/70"
                      }`}
                    />
                    {recording ? "Stop recording" : "Record voice note"}
                  </button>
                </div>
              </div>
            </div>
          </Field>
          <div className="flex items-center justify-between pt-2">
            <span className="text-[13px] text-muted-foreground">{profileMsg}</span>
            <button
              type="button"
              onClick={saveProfile}
              disabled={savingProfile}
              className="h-9 px-4 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-60"
            >
              {savingProfile ? "Saving…" : "Save profile"}
            </button>
          </div>
        </Section>
          </TabsContent>

          <TabsContent value="linkedin" className="mt-0">
        <Section
          title="LinkedIn connection"
          subtitle="Authorize once. Publish drafts straight from the workspace."
        >
          {conn ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-4 border border-border rounded-md bg-subtle/40">
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
                  <div className="text-[11px] font-mono text-muted-foreground truncate">
                    Token expires {new Date(conn.expires_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDisconnectLI(true)}
                disabled={disconnectingLinkedIn}
                className="h-9 px-3 rounded-md border border-border text-[13px] text-ink hover:bg-subtle w-full sm:w-auto disabled:opacity-60"
              >
                {disconnectingLinkedIn ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-4 border border-border rounded-md">
              <div className="min-w-0">
                <div className="text-[14px] text-ink font-medium">Not connected</div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  Required to publish posts directly from SocialSync.
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
          )}
        </Section>
          </TabsContent>

          <TabsContent value="billing" className="mt-0">
        <Section title="Billing & plan" subtitle="Your current subscription and usage limits.">
          {billingMsg && (
            <div className="px-3 py-2 rounded-md border border-border bg-subtle text-[13px] text-ink">
              {billingMsg}
            </div>
          )}
          {(() => {
            const effectivePlan: PlanTier = isAdmin ? "teams" : (sub?.plan ?? "trial");
            const effectiveStatus = isAdmin ? "admin" : (sub?.status ?? "trialing");
            const limit = PLAN_LIMITS[effectivePlan].maxDrafts;
            const linkedInMax = PLAN_LIMITS[effectivePlan].maxLinkedInAccounts;
            const draftStr = limit === null ? "Unlimited drafts" : `${limit} drafts / period`;
            return (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-4 border border-border rounded-md bg-subtle/40">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-ink">
                    {PLAN_LABELS[effectivePlan]} plan
                    <span className="ml-2 text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
                      {effectiveStatus}
                    </span>
                  </div>
                  <div className="text-[12px] text-muted-foreground mt-1">
                    {draftStr} · {linkedInMax} LinkedIn account{linkedInMax > 1 ? "s" : ""}
                  </div>
                  {isAdmin ? (
                    <div className="text-[12px] text-muted-foreground mt-0.5">
                      Admin access — all features unlocked, no billing required.
                    </div>
                  ) : sub?.plan === "trial" && sub.trial_end ? (
                    <div className="text-[12px] text-muted-foreground mt-0.5">
                      Trial ends {new Date(sub.trial_end).toLocaleDateString()}
                    </div>
                  ) : sub && sub.plan !== "trial" && sub.current_period_end ? (
                    <div className="text-[12px] text-muted-foreground mt-0.5">
                      {sub.cancel_at_period_end ? "Cancels" : "Renews"} on{" "}
                      {new Date(sub.current_period_end).toLocaleDateString()}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:items-end w-full sm:w-auto">
                  {isAdmin ? null : sub?.polar_customer_id ? (
                    <button
                      type="button"
                      onClick={openBillingPortal}
                      disabled={openingPortal}
                      className="h-9 px-3 rounded-md border border-border text-[13px] text-ink hover:bg-subtle disabled:opacity-60 w-full sm:w-auto"
                    >
                      {openingPortal ? "Opening…" : "Manage billing"}
                    </button>
                  ) : (
                    <Link
                      to="/pricing"
                      className="h-9 px-3 inline-flex items-center justify-center rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 w-full sm:w-auto"
                    >
                      Upgrade →
                    </Link>
                  )}
                </div>
              </div>
            );
          })()}
        </Section>
          </TabsContent>

          <TabsContent value="account" className="mt-0">
        <Section title="Account" subtitle="Email, password, and session.">
          <Field label="Email">
            <input
              value={user?.email ?? ""}
              readOnly
              className="h-10 w-full px-3 rounded-md border border-border bg-subtle text-[14px] text-muted-foreground"
            />
          </Field>
          <Field label="New password" hint="At least 6 characters.">
            <div className="flex gap-2">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10 flex-1 px-3 rounded-md border border-border bg-card text-[14px] focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink"
              />
              <button
                type="button"
                onClick={changePassword}
                disabled={savingPassword || newPassword.length < 6}
                className="h-10 px-4 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-60"
              >
                {savingPassword ? "Updating…" : "Update"}
              </button>
            </div>
          </Field>
          {pwMsg && <p className="text-[13px] text-muted-foreground">{pwMsg}</p>}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setConfirmSignOut(true)}
              className="h-9 px-4 rounded-md border border-border text-[13px] text-ink hover:bg-subtle"
            >
              Sign out
            </button>
          </div>
        </Section>
          </TabsContent>

          <TabsContent value="danger" className="mt-0">
        <Section
          title="Danger zone"
          subtitle="Permanent actions. Type DELETE to confirm."
          tone="danger"
        >
          <Field label="Confirm">
            <input
              value={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.value)}
              placeholder="DELETE"
              className="h-10 w-full px-3 rounded-md border border-destructive/30 bg-card text-[14px] focus:outline-none focus:ring-2 focus:ring-destructive/30"
            />
          </Field>
          <button
            type="button"
            onClick={() => setConfirmWipe(true)}
            disabled={deleting || confirmDelete !== "DELETE"}
            className="h-9 px-4 rounded-md bg-destructive text-destructive-foreground text-[13px] font-medium hover:bg-destructive/90 disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete all my data"}
          </button>
          <p className="text-[12px] text-muted-foreground">
            Removes drafts, profile, and LinkedIn token. Your auth account stays — contact support
            to fully erase it.
          </p>
        </Section>
          </TabsContent>
        </Tabs>

        <p className="mt-12 text-[13px] text-muted-foreground">
          ←{" "}
          <Link to="/app" className="hover:text-ink">
            Back to workspace
          </Link>
        </p>
      </main>

      <ConfirmDialog
        open={confirmRemoveAvatar}
        onOpenChange={setConfirmRemoveAvatar}
        title="Remove profile photo?"
        description="Your avatar will revert to your initials until you upload a new photo."
        confirmText="Remove photo"
        variant="destructive"
        onConfirm={() => {
          setConfirmRemoveAvatar(false);
          void removeAvatar();
        }}
      />
      <ConfirmDialog
        open={confirmDisconnectLI}
        onOpenChange={setConfirmDisconnectLI}
        title="Disconnect LinkedIn?"
        description="You won't be able to publish directly to LinkedIn until you reconnect."
        confirmText="Disconnect"
        variant="destructive"
        onConfirm={() => {
          setConfirmDisconnectLI(false);
          void disconnectLinkedIn();
        }}
      />
      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="Sign out?"
        description="You'll need to sign in again to access your workspace, drafts, and settings."
        confirmText="Sign out"
        onConfirm={() => {
          setConfirmSignOut(false);
          void signOut();
        }}
      />
      <ConfirmDialog
        open={confirmWipe}
        onOpenChange={setConfirmWipe}
        title="Delete all your data?"
        description="This permanently removes your drafts, profile, and LinkedIn connection. This cannot be undone."
        confirmText="Delete everything"
        variant="destructive"
        onConfirm={() => {
          setConfirmWipe(false);
          void deleteAccount();
        }}
      />
    </div>
  );
}

function Section({
  title,
  subtitle,
  tone = "default",
  children,
}: {
  title: string;
  subtitle?: string;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <section
      className={`mb-8 rounded-xl border bg-card overflow-hidden ${
        tone === "danger" ? "border-destructive/30" : "border-border"
      }`}
    >
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-border">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && (
          <p className="text-[13px] text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
      <div className="px-4 sm:px-6 py-4 sm:py-5 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.12em]">
        {label}
      </span>
      {children}
      {hint && <span className="text-[12px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
