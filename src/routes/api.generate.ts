import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestHeader } from "@tanstack/react-start/server";

const SYSTEM_PROMPT = `You are Syncd, an expert LinkedIn writing assistant.

You transform raw, messy thoughts into a single polished LinkedIn post that sounds authentically human — never corporate, never generic.

Strict rules:
- Write ONE post only. No options, no commentary, no preamble.
- Do not use markdown formatting (no **, no #, no bullet asterisks). Plain text with line breaks only.
- Open with a strong, specific hook in the first line.
- Use short paragraphs separated by blank lines for skimmability.
- Include a personal stake or concrete detail; avoid vague platitudes.
- End with a quiet payoff or one open question — never with "What do you think?" or "Let me know in the comments."
- Stay under 2,800 characters.
- Match the requested tone exactly.
- Output the post text directly with no surrounding quotes or labels.`;

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

export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (!LOVABLE_API_KEY) {
          return new Response(
            JSON.stringify({ error: "AI is not configured on the server." }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        // Require authentication
        const authHeader =
          getRequestHeader("authorization") ?? getRequestHeader("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response(
            JSON.stringify({ error: "Not authenticated." }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
        const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
          authHeader.slice(7),
        );
        if (userErr || !userData.user) {
          return new Response(
            JSON.stringify({ error: "Not authenticated." }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
        const userId = userData.user.id;

        // Read voice notes from the authenticated user's profile
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("voice_notes")
          .eq("user_id", userId)
          .maybeSingle();
        const voiceNotes = (prof?.voice_notes ?? "").trim();

        // Credit accounting: server-side deduction via RPC
        {
          const { data: creditRes, error: creditErr } = await supabaseAdmin.rpc(
            "consume_credit",
            { _user_id: userId },
          );
          if (creditErr) {
            console.error("[generate] consume_credit failed", creditErr);
            return new Response(
              JSON.stringify({ error: "Could not verify your credit balance." }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }
          const res = creditRes as { success?: boolean; reason?: string } | null;
          if (!res?.success) {
            const reason = res?.reason;
            const message =
              reason === "daily_limit_reached"
                ? "You've hit today's 5-generation cap on the Free plan. Come back tomorrow or upgrade to Studio."
                : reason === "no_credits"
                  ? "You're out of credits. Upgrade or buy a top-up pack to keep generating."
                  : "You don't have enough credits for this generation.";
            return new Response(
              JSON.stringify({ error: message, code: "NO_CREDITS" }),
              { status: 402, headers: { "Content-Type": "application/json" } },
            );
          }
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { input, tone, images } = (body ?? {}) as {
          input?: unknown;
          tone?: unknown;
          images?: unknown;
        };

        if (typeof input !== "string" || input.trim().length === 0) {
          return new Response(
            JSON.stringify({ error: "Please provide some raw material to work from." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        if (input.length > 4000) {
          return new Response(
            JSON.stringify({ error: "Raw material is too long (max 4,000 characters)." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        // Validate images: array of data URLs, max 4
        const imageUrls: string[] = [];
        if (Array.isArray(images)) {
          for (const img of images.slice(0, 4)) {
            if (
              typeof img === "string" &&
              img.startsWith("data:image/") &&
              img.length < 7_000_000
            ) {
              imageUrls.push(img);
            }
          }
        }

        const safeTone: Tone = isValidTone(tone) ? tone : "Authoritative & Warm";

        const voiceBlock = voiceNotes
          ? `\n\nWriter's voice notes (follow these strictly):\n"""\n${voiceNotes.slice(0, 1500)}\n"""`
          : "";

        const imageInstruction = imageUrls.length
          ? `\n\nThe writer attached ${imageUrls.length} image(s) as additional context. Weave relevant visual details (people, places, screenshots, products, moments) into the post naturally if they add specificity.`
          : "";

        const userText = `Tone: ${safeTone}${voiceBlock}${imageInstruction}

Raw material from the writer:
"""
${input.trim()}
"""

Write the LinkedIn post now.`;

        const userContent: Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string } }
        > = [{ type: "text", text: userText }];
        for (const url of imageUrls) {
          userContent.push({ type: "image_url", image_url: { url } });
        }

        let response: Response;
        try {
          response = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                stream: true,
                messages: [
                  { role: "system", content: SYSTEM_PROMPT },
                  { role: "user", content: userContent },
                ],
              }),
            },
          );
        } catch (fetchErr) {
          console.error("[generate] gateway fetch failed", fetchErr);
          await supabaseAdmin
            .rpc("refund_credit", { _user_id: userId, _reason: "ai_provider_error" })
            .then(({ error }) => {
              if (error) console.error("[generate] refund_credit failed", error);
            });
          return new Response(
            JSON.stringify({ error: "The AI gateway is unreachable. Please try again." }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }

        if (!response.ok) {
          // Refund the credit — provider failed, not the user's fault.
          await supabaseAdmin
            .rpc("refund_credit", { _user_id: userId, _reason: "ai_provider_error" })
            .then(({ error }) => {
              if (error) console.error("[generate] refund_credit failed", error);
            });
          if (response.status === 429) {
            return new Response(
              JSON.stringify({
                error: "You're generating a little too fast. Try again in a minute.",
              }),
              { status: 429, headers: { "Content-Type": "application/json" } },
            );
          }
          if (response.status === 402) {
            return new Response(
              JSON.stringify({
                error: "AI credits exhausted. Add funds to keep generating.",
              }),
              { status: 402, headers: { "Content-Type": "application/json" } },
            );
          }
          const text = await response.text().catch(() => "");
          console.error("[generate] gateway error", response.status, text);
          return new Response(
            JSON.stringify({ error: "The AI gateway returned an error." }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response(response.body, {
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
