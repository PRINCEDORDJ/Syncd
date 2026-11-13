import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/lib/supabase-admin.server";
import { AiConfigurationError, transcribeAudio } from "@/lib/ai-provider.server";
import { z } from "zod";

// Base64 body cap — a ~90s opus recording is well under 1MB, so 10MB leaves
// generous headroom while staying far below Gemini's inline-data request limit.
const requestSchema = z.object({
  audio: z.string().min(1).max(10_000_000),
  mimeType: z.string().regex(/^audio\//),
});

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = getRequestHeader("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return json({ error: "Not authenticated." }, 401);
        }
        const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
          authHeader.slice(7),
        );
        if (userErr || !userData.user) {
          return json({ error: "Not authenticated." }, 401);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body." }, 400);
        }
        const parsed = requestSchema.safeParse(body);
        if (!parsed.success) {
          return json({ error: "Invalid audio payload." }, 400);
        }

        let text: string;
        try {
          text = await transcribeAudio({
            base64: parsed.data.audio,
            mimeType: parsed.data.mimeType,
          });
        } catch (e) {
          if (e instanceof AiConfigurationError) {
            return json(
              { error: "Voice transcription isn't configured yet. Contact support." },
              500,
            );
          }
          console.error("transcribe failed", e);
          return json({ error: "Transcription failed. Try again in a moment." }, 502);
        }

        return json({ text }, 200);
      },
    },
  },
});
