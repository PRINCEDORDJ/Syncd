import { createFileRoute } from "@tanstack/react-router";

const SYSTEM_PROMPT = `You are SocialSync, an expert LinkedIn writing assistant.

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

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { input, tone } = (body ?? {}) as {
          input?: unknown;
          tone?: unknown;
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

        const safeTone: Tone = isValidTone(tone) ? tone : "Authoritative & Warm";

        const userMessage = `Tone: ${safeTone}

Raw material from the writer:
"""
${input.trim()}
"""

Write the LinkedIn post now.`;

        const response = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              stream: true,
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userMessage },
              ],
            }),
          },
        );

        if (!response.ok) {
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
                error:
                  "AI credits exhausted. Add funds in Workspace → Usage to keep generating.",
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
