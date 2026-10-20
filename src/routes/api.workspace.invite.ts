import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-admin.server";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase-env.server";

const bodySchema = z.object({
  workspace_id: z.string().uuid(),
  email: z.string().email().max(320),
  role: z.enum(["member", "admin"]).optional().default("member"),
});

type InviteRpcResult = {
  success?: boolean;
  reason?: string;
  invite_id?: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const REASON_MESSAGES: Record<string, string> = {
  not_authorized: "Only the workspace owner or an admin can invite members.",
  plan_does_not_allow_invites:
    "Inviting collaborators requires the Teams plan. Upgrade in Settings → Billing.",
  seat_limit_reached: "This workspace is already at its 5-seat limit.",
  already_a_member: "That person is already a member of this workspace.",
  invalid_email: "Please enter a valid email address.",
  rate_limited: "Too many invites sent recently. Try again in a little while.",
  not_authenticated: "Not authenticated.",
};

/**
 * Sends a workspace invite. The invite row and (when the email already has a
 * confirmed account) the in-app notification are created by the
 * `create_workspace_invite` RPC. Email delivery happens here, server-side,
 * only when no confirmed account exists — and the response is identical in
 * both cases so the endpoint cannot be used to discover registered users.
 */
export const Route = createFileRoute("/api/workspace/invite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = getRequestHeader("authorization") ?? getRequestHeader("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return jsonResponse({ error: "Not authenticated." }, 401);
        }
        const token = authHeader.slice(7);

        const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
        if (userErr || !userData.user) {
          return jsonResponse({ error: "Not authenticated." }, 401);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body." }, 400);
        }

        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse({ error: "Please provide a workspace id and a valid email." }, 400);
        }
        const { workspace_id, email, role } = parsed.data;

        // Call the RPC with the caller's JWT so auth.uid() resolves inside the
        // security definer function (never with the service-role client).
        const userClient = createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data, error } = await userClient.rpc("create_workspace_invite", {
          p_workspace_id: workspace_id,
          p_email: email,
          p_role: role,
        });

        if (error) {
          console.error("[workspace-invite] create_workspace_invite failed", error);
          return jsonResponse({ error: "Could not create the invite." }, 500);
        }

        const result = (data ?? {}) as InviteRpcResult;
        if (!result.success) {
          const message = REASON_MESSAGES[result.reason ?? ""] ?? "Could not create the invite.";
          return jsonResponse({ error: message, reason: result.reason }, 400);
        }

        // Same generic success whether or not an account exists.
        // The RPC inserts a notifications row only when a confirmed account
        // exists for the invited email — use that (via the service-role client,
        // which bypasses RLS) to decide whether to also send the email.
        try {
          const { data: notif } = await supabaseAdmin
            .from("notifications")
            .select("id")
            .eq("type", "workspace_invite")
            .filter("payload->>invite_id", "eq", result.invite_id)
            .limit(1)
            .maybeSingle();

          if (!notif) {
            const resendKey = process.env.RESEND_API_KEY;
            if (resendKey) {
              const resend = new Resend(resendKey);
              const appUrl = process.env.APP_URL || new URL(request.url).origin;
              const from = process.env.RESEND_FROM || "Syncd <invites@syncd.app>";
              const workspaceName = await supabaseAdmin
                .from("workspaces")
                .select("name")
                .eq("id", workspace_id)
                .maybeSingle();

              await resend.emails.send({
                from,
                to: email,
                subject: `You've been invited to ${
                  workspaceName.data?.name ?? "a workspace"
                } on Syncd`,
                html: `
                  <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                    <h2 style="margin:0 0 12px">Join a workspace on Syncd</h2>
                    <p style="color:#444;margin:0 0 20px">
                      You've been invited to collaborate in
                      <strong>${workspaceName.data?.name ?? "a workspace"}</strong>.
                      Create an account (or sign in) with this email address to accept the invite.
                    </p>
                    <a href="${appUrl}/login?invite=${result.invite_id}"
                       style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
                      Accept invite
                    </a>
                    <p style="color:#888;font-size:12px;margin-top:20px">
                      This invite expires in 7 days. If you weren't expecting it, ignore this email.
                    </p>
                  </div>
                `,
              });
            }
          }
        } catch (err) {
          // Email delivery is best-effort; the invite itself is already created.
          console.error("[workspace-invite] email send failed", err);
        }

        return jsonResponse({ success: true });
      },
    },
  },
});
