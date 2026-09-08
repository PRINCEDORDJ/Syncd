import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/lib/supabase-admin.server";
import {
  AiConfigurationError,
  createAiTextStream,
  type AiImageInput,
} from "@/lib/ai-provider.server";

const SYSTEM_PROMPT = `You are Syncd, an expert AI LinkedIn writing assistant and post generator.

Your role is twofold:
1. Act as a thoughtful, insightful writing coach in the chat conversation.
2. Generate and refine polished LinkedIn posts directly on the Canvas.

OUTPUT FORMAT RULES:
Always structure your response using these exact delimiters:

<<<THOUGHTS>>>
[1 to 3 friendly, expert sentences to the writer in chat. Explain your strategic angle, hook rationale, what you changed, or answer any specific questions/brainstorming prompts.]
<<<POST>>>
[The full polished LinkedIn post text to appear on the Canvas.
Rules for the post:
- Plain text only with natural line breaks. Do NOT use markdown formatting (no **, no #, no bullet asterisks).
- Open with a strong, arresting first line hook.
- Use short, breathable paragraphs separated by blank lines.
- Include specific details, real tension, or actionable takeaways — never corporate buzzwords or generic platitudes.
- End with a quiet payoff or one natural open question — never cliché "What do you think?" or "Let me know in the comments".
- Strictly match the requested tone.
- Stay under 2,800 characters.]

If the user is ONLY asking a question, asking for advice, or chatting without requesting a post draft creation or change:
<<<THOUGHTS>>>
[Your complete helpful response to the user's question]
<<<POST>>>
KEEP_CURRENT`;

const VALID_TONES = [
  "Authoritative & Warm",
  "Conversational",
  "Contrarian",
  "Storytelling",
] as const;
type Tone = (typeof VALID_TONES)[number];

function isValidTone(t: unknown): t is Tone {
  return typeof t === "string" && (VALID_TONES as readonly string[]).includes(t);
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function refundCredit(userId: string) {
  const { error } = await supabaseAdmin.rpc("refund_credit", {
    _user_id: userId,
    _reason: "ai_provider_error",
  });
  if (error) console.error("[generate] refund_credit failed", error);
}

function providerErrorMessage(error: unknown): string {
  if (error instanceof AiConfigurationError) return error.message;
  return "The AI provider is unavailable. Please try again.";
}

function toSseStream(textStream: AsyncIterable<string>, userId: string) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of textStream) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`,
            ),
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        console.error("[generate] AI stream failed", error);
        await refundCredit(userId);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: providerErrorMessage(error) })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });
}

export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader =
          getRequestHeader("authorization") ?? getRequestHeader("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return jsonResponse({ error: "Not authenticated." }, 401);
        }

        const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
          authHeader.slice(7),
        );
        if (userErr || !userData.user) {
          return jsonResponse({ error: "Not authenticated." }, 401);
        }
        const userId = userData.user.id;

        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("voice_notes")
          .eq("user_id", userId)
          .maybeSingle();
        const voiceNotes = (prof?.voice_notes ?? "").trim();

        const { data: creditRes, error: creditErr } = await supabaseAdmin.rpc(
          "consume_credit",
          { _user_id: userId },
        );
        if (creditErr) {
          console.error("[generate] consume_credit failed", creditErr);
          return jsonResponse({ error: "Could not verify your credit balance." }, 500);
        }
        const credit: any = creditRes as { success?: boolean; reason?: string } | null;
        if (!credit?.success) {
          const message =
            credit.reason === "daily_limit_reached"
              ? "You've hit today's 5-generation cap on the Free plan. Come back tomorrow or upgrade to Studio."
              : credit.reason === "no_credits"
                ? "You're out of credits. Upgrade or buy a top-up pack to keep generating."
                : "You don't have enough credits for this generation.";
          return jsonResponse({ error: message, code: "NO_CREDITS" }, 402);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body." }, 400);
        }

        const { input, tone, images } = (body ?? {}) as {
          input?: unknown;
          tone?: unknown;
          images?: unknown;
        };
        if (typeof input !== "string" || input.trim().length === 0) {
          return jsonResponse(
            { error: "Please provide some raw material to work from." },
            400,
          );
        }
        if (input.length > 4000) {
          return jsonResponse(
            { error: "Raw material is too long (max 4,000 characters)." },
            400,
          );
        }

        const imageInputs: AiImageInput[] = [];
        if (Array.isArray(images)) {
          for (const image of images.slice(0, 4)) {
            if (typeof image !== "string" || !image.startsWith("data:image/")) continue;
            if (image.length >= 7_000_000) continue;
            const match = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(image);
            if (!match) continue;
            imageInputs.push({ dataUrl: image, mimeType: match[1], base64: match[2] });
          }
        }

        const safeTone: Tone = isValidTone(tone) ? tone : "Authoritative & Warm";
        const voiceBlock = voiceNotes
          ? `\n\nWriter's voice notes (follow these strictly):\n"""\n${voiceNotes.slice(0, 1500)}\n"""`
          : "";
        const imageInstruction = imageInputs.length
          ? `\n\nThe writer attached ${imageInputs.length} image(s) as additional context. Weave relevant visual details (people, places, screenshots, products, moments) into the post naturally if they add specificity.`
          : "";
        const userPrompt = `Tone: ${safeTone}${voiceBlock}${imageInstruction}

Raw material from the writer:
"""
${input.trim()}
"""

Write the LinkedIn post now.`;

        let textStream: AsyncIterable<string>;
        try {
          textStream = await createAiTextStream({
            systemPrompt: SYSTEM_PROMPT,
            userPrompt,
            images: imageInputs,
          });
        } catch (error) {
          console.error("[generate] AI provider request failed", error);
          await refundCredit(userId);
          return jsonResponse({ error: providerErrorMessage(error) }, 502);
        }

        return new Response(toSseStream(textStream, userId), {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});

