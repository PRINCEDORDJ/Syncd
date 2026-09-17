import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { uploadAvatar as uploadAvatarFn, removeAvatar as removeAvatarFn } from "@/lib/avatar-upload";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Section, Field } from "./ui-primitives";
import type { PlanTier } from "@/lib/plans";

interface Profile {
  display_name: string | null;
  avatar_url: string | null;
  voice_notes: string | null;
}

export function ProfileSettingsPanel({
  user,
  effectivePlan,
  isAdmin,
}: {
  user: User;
  effectivePlan: PlanTier;
  isAdmin: boolean;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [voiceNotes, setVoiceNotes] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [confirmRemoveAvatar, setConfirmRemoveAvatar] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  // Voice notes dictation
  const [recording, setRecording] = useState(false);
  const [voiceMsg, setVoiceMsg] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, voice_notes")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const metaAvatar =
        (user.user_metadata?.avatar_url as string | undefined) ||
        (user.user_metadata?.picture as string | undefined) ||
        null;
      const metaName =
        (user.user_metadata?.display_name as string | undefined) ||
        (user.user_metadata?.full_name as string | undefined) ||
        (user.user_metadata?.name as string | undefined) ||
        "";

      const p = prof ?? { display_name: null, avatar_url: null, voice_notes: null };
      setProfile(p);
      setDisplayName(p.display_name ?? metaName);
      setAvatarUrl(p.avatar_url ?? metaAvatar ?? "");
      setVoiceNotes(p.voice_notes ?? "");
    })();
    return () => { cancelled = true; };
  }, [user]);

  async function uploadAvatar(file: File) {
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

  async function saveProfile() {
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

  return (
    <>
      <Section title="Profile" subtitle="How you appear inside Syncd.">
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
                      {(displayName || user.email || "?")[0]?.toUpperCase()}
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
            {!isAdmin && effectivePlan === "trial" && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-border bg-subtle text-[12px] text-muted-foreground">
                <span>Voice mapping is a Studio & Teams feature. Upgrade to have the AI match your unique voice on every generation.</span>
                <Link to="/pricing" className="underline font-medium text-ink shrink-0">Upgrade</Link>
              </div>
            )}
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
    </>
  );
}
