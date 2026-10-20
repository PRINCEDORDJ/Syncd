import { z } from "zod";

/**
 * Voice map — the structured voice profile.
 * Shape contract: keys and max lengths below are authoritative for
 * 1) the DB column `profiles.voice_profile` (jsonb),
 * 2) the settings form (config-driven),
 * 3) the prompt renderer used by /api/generate and /api/voice/calibrate.
 */

export const VOICE_FIELDS = [
  {
    key: "point_of_view",
    label: "Point of view",
    placeholder:
      "Principles and arguments you keep returning to. e.g. “Ship before it's ready. Consistency beats intensity.”",
    maxLength: 300,
  },
  {
    key: "style_rhythm",
    label: "Style & rhythm",
    placeholder:
      "Paragraph shape, casing, punctuation habits. e.g. “Short paragraphs. One-line sentences for emphasis. No exclamation marks.”",
    maxLength: 300,
  },
  {
    key: "structural_habits",
    label: "Structural habits",
    placeholder:
      "How your posts open, build, and land. e.g. “Open with a specific confession or number. End with a quiet takeaway, not a CTA.”",
    maxLength: 500,
  },
  {
    key: "avoid_words",
    label: "Words to avoid",
    placeholder: "e.g. leverage, unlock, journey, game-changer, 'in today's landscape'",
    maxLength: 300,
  },
  {
    key: "signature_themes",
    label: "Signature themes",
    placeholder:
      "Recurring ideas and angles. e.g. “Deep work over hustle culture. Writing as thinking tool. Tool cost vs tool value.”",
    maxLength: 500,
  },
  {
    key: "example_excerpt",
    label: "Example excerpt",
    placeholder:
      "Paste one post that sounds exactly like you. The engine studies its shape and voice.",
    maxLength: 1200,
  },
] as const;

export type VoiceFieldKey = (typeof VOICE_FIELDS)[number]["key"];

const caps = Object.fromEntries(VOICE_FIELDS.map((f) => [f.key, f.maxLength])) as Record<
  VoiceFieldKey,
  number
>;

export const voiceProfileSchema = z
  .object({
    point_of_view: z.string(),
    style_rhythm: z.string(),
    structural_habits: z.string(),
    avoid_words: z.string(),
    signature_themes: z.string(),
    example_excerpt: z.string(),
  })
  .strict();

export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

export const EMPTY_VOICE_PROFILE: VoiceProfile = {
  point_of_view: "",
  style_rhythm: "",
  structural_habits: "",
  avoid_words: "",
  signature_themes: "",
  example_excerpt: "",
};

export function isValidVoiceProfile(value: unknown): value is VoiceProfile {
  const keys = Object.keys(caps) as string[];
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return keys.every((key) => typeof record[key] === "string");
}

/** Clamp every field to its length cap and coerce into the exact shape. */
export function normalizeVoiceProfile(raw: unknown): VoiceProfile {
  const record = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const clean = {} as VoiceProfile;
  for (const field of VOICE_FIELDS) {
    const value = record[field.key];
    clean[field.key] = typeof value === "string" ? value.trim().slice(0, field.maxLength) : "";
  }
  return clean;
}

function labeledLines(profile: VoiceProfile): string[] {
  const lines: string[] = [];
  const label: Record<VoiceFieldKey, string> = {
    point_of_view: "Point of view",
    style_rhythm: "Style & rhythm",
    structural_habits: "Structural habits",
    avoid_words: "Words to avoid",
    signature_themes: "Signature themes",
    example_excerpt: "Example excerpt (sounds exactly like the user)",
  };
  for (const field of VOICE_FIELDS) {
    const text = profile[field.key].trim();
    if (text) lines.push(`- ${label[field.key]}: ${text}`);
  }
  return lines;
}

/** Prompt block for /api/generate. Empty string when the map has no content. */
export function renderVoiceProfileBlock(profile: VoiceProfile | null | undefined): string {
  if (!profile || !isValidVoiceProfile(profile)) return "";
  const lines = labeledLines(profile);
  if (lines.length === 0) return "";
  return ["VOICE MAP (mirror this voice in every draft — follow strictly):", ...lines].join("\n");
}

export const CALIBRATION_LIMITS = {
  minPosts: 2,
  maxPosts: 5,
  maxPostLength: 6000,
  maxTotalLength: 12000,
} as const;

export function sanitizePostSamples(raw: unknown): {
  posts: string[];
  error: string | null;
} {
  if (!Array.isArray(raw)) {
    return { posts: [], error: "Provide your sample posts as a list." };
  }
  const posts: string[] = [];
  let total = 0;
  for (const item of raw.slice(0, CALIBRATION_LIMITS.maxPosts)) {
    if (typeof item !== "string") continue;
    const text = item.trim();
    if (!text) continue;
    const clipped = text.slice(0, CALIBRATION_LIMITS.maxPostLength);
    total += clipped.length;
    if (total > CALIBRATION_LIMITS.maxTotalLength) {
      return {
        posts: [],
        error: "All samples together are too long (max 12,000 characters).",
      };
    }
    posts.push(clipped);
  }
  if (posts.length < CALIBRATION_LIMITS.minPosts) {
    return {
      posts: [],
      error: `Add at least ${CALIBRATION_LIMITS.minPosts} of your real posts.`,
    };
  }
  return { posts, error: null };
}

export const CALIBRATION_INSTRUCTION = `You are calibrating a writing voice profile. You will be given real posts written by the same person. Study theme, judgment, sentence rhythm, structure, and vocabulary — then fill in the voice profile JSON.

Return ONLY JSON (no markdown fences, no commentary) with exactly these keys:
{
  "point_of_view": "<the person's core stances and recurring arguments, written as crisp guidance, max 300 chars>",
  "style_rhythm": "<paragraph shape, sentence length, casing and punctuation habits, max 300 chars>",
  "structural_habits": "<how openings, builds and endings are constructed, max 500 chars>",
  "avoid_words": "<words and filler phrases the person never uses, double-quoted if specific, max 300 chars>",
  "signature_themes": "<recurring ideas and angles, max 500 chars>",
  "example_excerpt": "<one distilled excerpt (50-1200 chars) rewritten to match what the person genuinely sounds like>",
}
Every key is required. Every value must be plain text in the same language as the posts.`;

/** Extract the first JSON object from a model response that may add prose. */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  for (let end = cleaned.lastIndexOf("}"); end > start; end--) {
    const candidate = cleaned.slice(start, end + 1);
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // keep scanning
    }
  }
  return null;
}
