import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Section, Field } from "./ui-primitives";
import type { PlanTier } from "@/lib/plans";
import {
  VOICE_FIELDS,
  voiceProfileSchema,
  sanitizePostSamples,
  CALIBRATION_LIMITS,
  EMPTY_VOICE_PROFILE,
  normalizeVoiceProfile,
  isValidVoiceProfile,
  type VoiceProfile,
} from "@/lib/voice-profile";

const MAX_SAMPLES = 5;

interface SpeechResultAlternative {
  transcript: string;
}
interface SpeechResultItem {
  isFinal: boolean;
  [index: number]: SpeechResultAlternative;
}
interface SpeechResultList {
  length: number;
  [index: number]: SpeechResultItem;
}
interface SpeechRecognitionResultEvent {
  resultIndex: number;
  results: SpeechResultList;
}
interface SpeechRecognitionErrorEvent {
  error?: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SRConstructor = new () => SpeechRecognitionLike;

const textareaCls =
  "w-full px-3 py-2.5 rounded-md border border-border bg-card text-[14px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink resize-none";

export function VoiceSection({
  user,
  effectivePlan,
  isAdmin,
}: {
  user: User;
  effectivePlan: PlanTier;
  isAdmin: boolean;
}) {
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>(EMPTY_VOICE_PROFILE);
  const [voiceNotes, setVoiceNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Calibration
  const [calibrateOpen, setCalibrateOpen] = useState(false);
  const [samples, setSamples] = useState<string[]>(["", ""]);
  const [calibrating, setCalibrating] = useState(false);
  const [calErr, setCalErr] = useState<string | null>(null);

  // Dictation (kept from the legacy voice-notes editor)
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("voice_notes, voice_profile")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const stored = prof?.voice_profile;
      setVoiceProfile(
        isValidVoiceProfile(stored) ? normalizeVoiceProfile(stored) : EMPTY_VOICE_PROFILE,
      );
      setVoiceNotes(prof?.voice_notes ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  function setField(key: keyof VoiceProfile, value: string) {
    const cap = VOICE_FIELDS.find((f) => f.key === key)?.maxLength ?? 300;
    setVoiceProfile((prev) => ({ ...prev, [key]: value.slice(0, cap) }));
  }

  function toggleDictation() {
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }
    const SR =
      (
        window as unknown as {
          SpeechRecognition?: SRConstructor;
          webkitSpeechRecognition?: SRConstructor;
        }
      ).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SRConstructor }).webkitSpeechRecognition;
    if (!SR) {
      setMsg("Voice dictation isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (event) => {
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
    rec.onerror = (e) => {
      setMsg(`Mic error: ${e.error ?? "unknown"}`);
      setRecording(false);
    };
    rec.onend = () => setRecording(false);
    recognitionRef.current = rec;
    setMsg(null);
    setRecording(true);
    try {
      rec.start();
    } catch {
      setRecording(false);
    }
  }

  async function saveVoice() {
    setSaving(true);
    setMsg(null);
    const structured = voiceProfileSchema.safeParse(voiceProfile).success
      ? Object.values(voiceProfile).some((v) => v.trim())
        ? voiceProfile
        : null
      : null;
    const { error } = await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        voice_notes: voiceNotes.trim() || null,
        voice_profile: structured,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    setMsg(error ? `Failed to save: ${error.message}` : "Voice map saved.");
  }

  async function calibrate() {
    setCalErr(null);
    const checked = sanitizePostSamples(samples);
    if (checked.error || checked.posts.length === 0) {
      setCalErr(checked.error ?? "Add at least two of your real posts.");
      return;
    }
    setCalibrating(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/voice/calibrate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ posts: checked.posts }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        profile?: unknown;
        error?: string;
        code?: string;
      };
      if (!res.ok || !body.profile) {
        setCalErr(
          body.code === "PLAN_REQUIRED"
            ? (body.error ?? "Voice calibration is a Studio & Teams feature.")
            : (body.error ?? "Calibration failed. Try again in a moment."),
        );
        return;
      }
      setVoiceProfile(normalizeVoiceProfile(body.profile));
      setCalibrateOpen(false);
      setSamples(["", ""]);
      setMsg("Voice calibrated — review the fields, then Save voice map.");
    } catch {
      setCalErr("Network error. Check your connection and try again.");
    } finally {
      setCalibrating(false);
    }
  }

  function setSampleAt(index: number, value: string) {
    const cap = CALIBRATION_LIMITS.maxPostLength;
    setSamples((prev) => prev.map((s, i) => (i === index ? value.slice(0, cap) : s)));
  }

  const unlocked = isAdmin || effectivePlan === "studio" || effectivePlan === "teams";

  const sampleTotalChars = samples.reduce((acc, s) => acc + s.trim().length, 0);

  if (!unlocked) {
    return (
      <Section title="Voice map" subtitle="Teach Syncd to write like you on your best day.">
        <div className="p-3 rounded-md border border-border bg-subtle text-[12px] text-muted-foreground">
          Voice mapping is a Studio & Teams feature.{" "}
          <a href="/pricing" className="underline font-medium text-ink">
            Upgrade
          </a>{" "}
          to map your voice and have every generation read like you.
        </div>
      </Section>
    );
  }

  return (
    <>
      <Section
        title="Voice map"
        subtitle="Structured voice blueprint — the engine threads it into every generation."
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[12px] text-muted-foreground">
            {Object.values(voiceProfile).every((v) => !v.trim())
              ? "Your map is empty — fill the fields or calibrate from real posts."
              : `${VOICE_FIELDS.filter((f) => voiceProfile[f.key].trim()).length} of ${VOICE_FIELDS.length} sections active`}
          </div>
          <button
            type="button"
            onClick={() => {
              setCalErr(null);
              setCalibrateOpen(true);
            }}
            className="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-ink hover:bg-subtle"
          >
            Calibrate from my posts
          </button>
        </div>
        {VOICE_FIELDS.map((field) => (
          <Field key={field.key} label={field.label}>
            <textarea
              value={voiceProfile[field.key]}
              onChange={(e) => setField(field.key, e.target.value)}
              placeholder={field.placeholder}
              rows={field.key === "example_excerpt" ? 5 : 3}
              className={textareaCls}
            />
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {voiceProfile[field.key].length}/{field.maxLength}
            </div>
          </Field>
        ))}
        <Field
          label="Anything else (voice notes)"
          hint="Free-form details — the map above wins on conflicts with these."
        >
          <textarea
            value={voiceNotes}
            onChange={(e) => setVoiceNotes(e.target.value)}
            placeholder="I write in short paragraphs. I avoid the words 'leverage' and 'unlock'. My recurring theme is…"
            rows={4}
            className={textareaCls}
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[12px] text-muted-foreground">
              {recording
                ? "Listening… speak naturally, then click Stop."
                : (msg ?? `${voiceNotes.length} characters`)}
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
        </Field>
        <div className="flex items-center justify-between pt-2">
          <span className="text-[13px] text-muted-foreground">{msg}</span>
          <button
            type="button"
            onClick={saveVoice}
            disabled={saving}
            className="h-9 px-4 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save voice map"}
          </button>
        </div>
      </Section>

      <Dialog open={calibrateOpen} onOpenChange={(open) => !calibrating && setCalibrateOpen(open)}>
        <DialogContent className="max-w-[92vw] sm:max-w-2xl bg-background max-h-[85vh] overflow-y-auto">
          <DialogTitle>Calibrate from my posts</DialogTitle>
          <p className="text-[13px] text-muted-foreground">
            Paste 2–5 posts that sound unmistakably like you. Syncd writes the draft only (1 credit)
            and pre-fills the map — you review and save.
          </p>
          <div className="flex flex-col gap-3">
            {samples.map((sample, index) => (
              <div key={index} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-ink">Post {index + 1}</span>
                  {samples.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setSamples((prev) => prev.filter((_, i) => i !== index))}
                      className="text-[12px] text-muted-foreground hover:text-ink"
                      disabled={calibrating}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <textarea
                  value={sample}
                  onChange={(e) => setSampleAt(index, e.target.value)}
                  placeholder="Paste the post here…"
                  rows={5}
                  disabled={calibrating}
                  className={textareaCls}
                />
                <div className="text-[11px] text-muted-foreground">
                  {sample.length}/{CALIBRATION_LIMITS.maxPostLength}
                </div>
              </div>
            ))}
            {samples.length < MAX_SAMPLES && (
              <button
                type="button"
                onClick={() => setSamples((prev) => [...prev, ""])}
                disabled={calibrating}
                className="h-8 px-3 rounded-md border border-border text-[12px] text-ink hover:bg-subtle self-start"
              >
                + Add another post
              </button>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-[12px] text-muted-foreground">
              {calErr ??
                (calibrating
                  ? "Calibrating… this usually takes under a minute."
                  : `${sampleTotalChars} characters total`)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCalibrateOpen(false)}
                disabled={calibrating}
                className="h-9 px-3 rounded-md border border-border text-[13px] text-ink hover:bg-subtle"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void calibrate()}
                disabled={calibrating || sampleTotalChars === 0}
                className="h-9 px-4 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90 disabled:opacity-60"
              >
                {calibrating ? "Calibrating…" : "Calibrate"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
