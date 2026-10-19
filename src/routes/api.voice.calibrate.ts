import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/lib/supabase-admin.server";
import { AiConfigurationError, generateAiText } from "@/lib/ai-provider.server";
import { PLAN_LIMITS } from "@/lib/plans";
import {
  CALIBRATION_INSTRUCTION,
  CALIBRATION_LIMITS,
  extractJsonObject,
  normalizeVoiceProfile,
  sanitizePostSamples,
  voiceProfileSchema,
  type VoiceProfile,
} from "@/lib/voice-profile";
import { z } from "zod";

const CALIBRATION_SYSTEM = `You are Syncd's voice calibration engine. You analyze a person's real writing samples and produce a structured voice profile so every future AI draft sounds exactly like them. Output only JSON exactly matching the requested schema.`;

const requestSchema = z.object({
  posts: z.array(z.string()).min(1).max(CALIBRATION_LIMITS.maxPosts),
});

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/voice/calibrate")({
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
        const userId = userData.user.id;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body." }, 400);
        }
        const parsedBody = requestSchema.safeParse(body);
        if (!parsedBody.success) {
          return json({ error: "Invalid request payload." }, 400);
        }

        const { posts, error: samplesError } = sanitizePostSamples(parsedBody.data.posts);
        if (samplesError || posts.length === 0) {
          return json({ error: samplesError ?? "Provide at least two sample posts." }, 400);
        }

        // Voice mapping is a Studio/Teams feature (admins ignore plan tiers).
        const [planRes, roleRes] = await Promise.all([
          supabaseAdmin.rpc("get_user_plan", { _user_id: userId }),
          supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
        ]);
        const isAdmin = !!roleRes.data?.some((r) => r.role === "admin");
        const userPlan = isAdmin ? "teams" : ((planRes.data as string | null) ?? "trial");
        if (!PLAN_LIMITS[userPlan as keyof typeof PLAN_LIMITS]?.voiceMapping) {
          return json(
            {
              error:
                "Voice calibration is a Studio & Teams feature. Upgrade to map your writing voice.",
              code: "PLAN_REQUIRED",
            },
            402,
          );
        }

        // Calibration burns one generation credit the same way a draft does.
        const { data: creditRes, error: creditErr } = await supabaseAdmin.rpc("consume_credit", {
          _user_id: userId,
        });
        if (creditErr) {
          return json({ error: "Could not verify your credit balance." }, 500);
        }
        const credit = (creditRes ?? null) as {
          success?: boolean;
          reason?: string;
          source?: string;
        } | null;
        if (!credit?.success) {
          return json(
            {
              error:
                credit?.reason === "daily_limit_reached"
                  ? "You've hit today's 5-generation cap on the Free plan."
                  : credit?.reason === "no_workspace"
                    ? "No workspace found for your account."
                    : "You're out of credits. Upgrade or top up to calibrate your voice.",
              code: "NO_CREDITS",
            },
            402,
          );
        }
        const creditSource =
          credit.source === "topup"
            ? "topup"
            : credit.source === "subscription"
              ? "subscription"
              : "auto";

        const samplesBlock = posts.map((post, i) => `--- POST ${i + 1} ---\n${post}`).join("\n\n");

        let raw: string;
        try {
          raw = await generateAiText({
            systemPrompt: `${CALIBRATION_SYSTEM}\n\n${CALIBRATION_INSTRUCTION}`,
            userPrompt: samplesBlock,
            images: [],
          });
        } catch (e) {
          if (e instanceof AiConfigurationError) {
            await supabaseAdmin.rpc("refund_credit", {
              _user_id: userId,
              _reason: "calibration_provider_unconfigured",
              _credit_type: creditSource,
            });
            return json(
              { error: "AI is not configured for calibration yet. Contact support." },
              500,
            );
          }
          await supabaseAdmin.rpc("refund_credit", {
            _user_id: userId,
            _reason: "calibration_provider_error",
            _credit_type: creditSource,
          });
          return json({ error: "Calibration failed. Try again in a moment." }, 502);
        }

        const parsedJson = extractJsonObject(raw);
        const profileCheck = voiceProfileSchema.safeParse(parsedJson);
        if (!parsedJson || !profileCheck.success) {
          await supabaseAdmin.rpc("refund_credit", {
            _user_id: userId,
            _reason: "calibration_invalid_output",
            _credit_type: creditSource,
          });
          return json(
            {
              error:
                "The calibration didn't return a usable voice profile. Try again — often it works on the second pass.",
              code: "BAD_OUTPUT",
            },
            502,
          );
        }

        const profile: VoiceProfile = normalizeVoiceProfile(parsedJson);
        return json({ profile }, 200);
      },
    },
  },
});
