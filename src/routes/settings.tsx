import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SiteNav } from "@/components/SiteNav";

export const Route = createFileRoute("/settings")({
  validateSearch: z.object({
    linkedin_connected: z.string().optional(),
    linkedin_error: z.string().optional(),
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

function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [conn, setConn] = useState<LinkedInConnection | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable form state
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [voiceNotes, setVoiceNotes] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  // Account
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");

  // LinkedIn flow
  const [connectingLinkedIn, setConnectingLinkedIn] = useState(false);
  const [linkedInBanner, setLinkedInBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (search.linkedin_connected === "1") {
      setLinkedInBanner({ type: "success", text: "LinkedIn connected successfully." });
    } else if (search.linkedin_error) {
      setLinkedInBanner({
        type: "error",
        text: `LinkedIn connection failed: ${search.linkedin_error}`,
      });
    }
  }, [search.linkedin_connected, search.linkedin_error]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: prof }, { data: linkedin }] = await Promise.all([
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
      ]);
      if (cancelled) return;
      const p = prof ?? { display_name: null, avatar_url: null, voice_notes: null };
      setProfile(p);
      setDisplayName(p.display_name ?? "");
      setAvatarUrl(p.avatar_url ?? "");
      setVoiceNotes(p.voice_notes ?? "");
      setConn(linkedin ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

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
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;
    const resp = await fetch("/api/linkedin/disconnect", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      setConn(null);
      setLinkedInBanner({ type: "success", text: "LinkedIn disconnected." });
    } else {
      const j = await resp.json().catch(() => ({}));
      setLinkedInBanner({ type: "error", text: j.error ?? "Failed to disconnect." });
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

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-3">
            Settings
          </p>
          <h1 className="text-3xl tracking-[-0.02em] font-semibold leading-tight">
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

        {/* Profile */}
        <Section title="Profile" subtitle="How you appear inside SocialSync.">
          <Field label="Display name">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jane Cooper"
              className="h-10 w-full px-3 rounded-md border border-border bg-card text-[14px] focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink"
            />
          </Field>
          <Field label="Avatar URL" hint="Paste a link to your profile picture (optional).">
            <input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
              className="h-10 w-full px-3 rounded-md border border-border bg-card text-[14px] focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink"
            />
          </Field>
          <Field
            label="Voice notes"
            hint="Free-text notes the AI will read before every generation. Hedge words you avoid, examples you reuse, your point of view."
          >
            <textarea
              value={voiceNotes}
              onChange={(e) => setVoiceNotes(e.target.value)}
              placeholder="I write in short paragraphs. I avoid the words 'leverage' and 'unlock'. My recurring theme is…"
              rows={5}
              className="w-full px-3 py-2.5 rounded-md border border-border bg-card text-[14px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink resize-none"
            />
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

        {/* LinkedIn */}
        <Section
          title="LinkedIn connection"
          subtitle="Authorize once. Publish drafts straight from the workspace."
        >
          {conn ? (
            <div className="flex items-center justify-between gap-4 p-4 border border-border rounded-md bg-subtle/40">
              <div className="flex items-center gap-3 min-w-0">
                {conn.linkedin_picture_url ? (
                  <img
                    src={conn.linkedin_picture_url}
                    alt=""
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
                onClick={disconnectLinkedIn}
                className="h-9 px-3 rounded-md border border-border text-[13px] text-ink hover:bg-subtle"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 p-4 border border-border rounded-md">
              <div>
                <div className="text-[14px] text-ink font-medium">Not connected</div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  Required to publish posts directly from SocialSync.
                </div>
              </div>
              <button
                type="button"
                onClick={connectLinkedIn}
                disabled={connectingLinkedIn}
                className="h-9 px-4 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-60 inline-flex items-center gap-2"
              >
                {connectingLinkedIn ? "Redirecting…" : "Connect LinkedIn"}
                <span aria-hidden>→</span>
              </button>
            </div>
          )}
        </Section>

        {/* Account */}
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
              onClick={() => signOut()}
              className="h-9 px-4 rounded-md border border-border text-[13px] text-ink hover:bg-subtle"
            >
              Sign out
            </button>
          </div>
        </Section>

        {/* Danger zone */}
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
            onClick={deleteAccount}
            disabled={deleting || confirmDelete !== "DELETE"}
            className="h-9 px-4 rounded-md bg-destructive text-destructive-foreground text-[13px] font-medium hover:bg-destructive/90 disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete all my data"}
          </button>
          <p className="text-[12px] text-muted-foreground">
            Removes drafts, profile, and LinkedIn token. Your auth account stays — contact
            support to fully erase it.
          </p>
        </Section>

        <p className="mt-12 text-[13px] text-muted-foreground">
          ← <Link to="/app" className="hover:text-ink">Back to workspace</Link>
        </p>
      </main>
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
      <div className="px-6 py-5 border-b border-border">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && (
          <p className="text-[13px] text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
      <div className="px-6 py-5 flex flex-col gap-4">{children}</div>
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
