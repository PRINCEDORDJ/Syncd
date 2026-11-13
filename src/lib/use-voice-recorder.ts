import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceRecorderStatus = "idle" | "recording" | "transcribing";

interface UseVoiceRecorderOptions {
  /** Uploads the finished recording and resolves with the transcript text. */
  transcribe: (blob: Blob) => Promise<string>;
  /** Called with the transcript only when transcription succeeds. */
  onTranscribed: (text: string) => void;
  /** Hard cap on recording length (seconds) — auto-stops past this. */
  maxSeconds?: number;
}

const DEFAULT_MAX_SECONDS = 90;

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

/** Reads a Blob as base64 (no data-url prefix) so it can travel as JSON. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Could not read the recording."));
    reader.readAsDataURL(blob);
  });
}

/** "0:07" style timer label for the recording UI. */
export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Microphone recording state machine: idle → recording → transcribing → idle.
 * Owns the MediaRecorder lifecycle and stream cleanup; the caller supplies the
 * upload/transcription step and receives the final transcript.
 */
export function useVoiceRecorder({
  transcribe,
  onTranscribed,
  maxSeconds = DEFAULT_MAX_SECONDS,
}: UseVoiceRecorderOptions) {
  const [status, setStatus] = useState<VoiceRecorderStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const mimeTypeRef = useRef("");
  const cancelledRef = useRef(false);
  const transcribeRef = useRef(transcribe);
  const onTranscribedRef = useRef(onTranscribed);

  useEffect(() => {
    transcribeRef.current = transcribe;
  }, [transcribe]);
  useEffect(() => {
    onTranscribedRef.current = onTranscribed;
  }, [onTranscribed]);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      cancelledRef.current = false;
      chunksRef.current = [];
      mimeTypeRef.current = pickMimeType();

      const recorder = new MediaRecorder(
        stream,
        mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : undefined,
      );
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeTypeRef.current || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        cleanup();
        if (cancelledRef.current) {
          setStatus("idle");
          return;
        }
        setStatus("transcribing");
        transcribeRef
          .current(blob)
          .then((text) => {
            if (!text.trim()) {
              setError("Nothing was captured — try recording again a bit closer to the mic.");
              return;
            }
            onTranscribedRef.current(text);
          })
          .catch((e: unknown) => {
            setError(
              e instanceof Error && e.message
                ? e.message
                : "Transcription failed. Try again in a moment.",
            );
          })
          .finally(() => setStatus("idle"));
      };

      recorder.start();
      setElapsed(0);
      setStatus("recording");
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (e) {
      cleanup();
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone access was denied. Allow it in your browser settings."
          : "Could not start recording.",
      );
    }
  }, [cleanup]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stop();
  }, [stop]);

  // Auto-stop at the recording cap so the upload stays small.
  useEffect(() => {
    if (status === "recording" && elapsed >= maxSeconds) stop();
  }, [elapsed, status, maxSeconds, stop]);

  // Hard cleanup on unmount: mark cancelled first so the trailing
  // onstop handler never fires a transcription request.
  useEffect(
    () => () => {
      cancelledRef.current = true;
      stop();
      cleanup();
    },
    [stop, cleanup],
  );

  return { status, elapsed, error, start, stop, cancel };
}
