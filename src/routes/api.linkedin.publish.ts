import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestHeader } from "@tanstack/react-start/server";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function authenticate(): Promise<{ userId: string } | { error: Response }> {
  const authHeader =
    getRequestHeader("authorization") ?? getRequestHeader("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: jsonResponse({ error: "Not authenticated." }, 401) };
  }
  const accessToken = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) {
    return { error: jsonResponse({ error: "Not authenticated." }, 401) };
  }
  return { userId: data.user.id };
}

export const Route = createFileRoute("/api/linkedin/publish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticate();
        if ("error" in auth) return auth.error;

        let body: { content?: unknown };
        try {
          body = (await request.json()) as { content?: unknown };
        } catch {
          return jsonResponse({ error: "Invalid JSON body." }, 400);
        }
        const content = body.content;
        if (typeof content !== "string" || content.trim().length === 0) {
          return jsonResponse({ error: "Post content is required." }, 400);
        }
        if (content.length > 3000) {
          return jsonResponse(
            { error: "Post exceeds LinkedIn's 3,000 character limit." },
            400,
          );
        }

        // Load connection
        const { data: conn, error: connErr } = await supabaseAdmin
          .from("linkedin_connections")
          .select("access_token, expires_at, linkedin_member_urn")
          .eq("user_id", auth.userId)
          .maybeSingle();
        if (connErr || !conn) {
          return jsonResponse(
            { error: "Connect LinkedIn in Settings before publishing." },
            400,
          );
        }
        if (new Date(conn.expires_at).getTime() < Date.now()) {
          return jsonResponse(
            {
              error:
                "Your LinkedIn connection has expired. Please reconnect in Settings.",
            },
            400,
          );
        }

        // Publish via UGC Posts API
        const ugcResp = await fetch("https://api.linkedin.com/v2/ugcPosts", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${conn.access_token}`,
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
          },
          body: JSON.stringify({
            author: conn.linkedin_member_urn,
            lifecycleState: "PUBLISHED",
            specificContent: {
              "com.linkedin.ugc.ShareContent": {
                shareCommentary: { text: content },
                shareMediaCategory: "NONE",
              },
            },
            visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
          }),
        });

        if (!ugcResp.ok) {
          const txt = await ugcResp.text().catch(() => "");
          console.error("[linkedin/publish] failed", ugcResp.status, txt);
          if (ugcResp.status === 401) {
            return jsonResponse(
              {
                error:
                  "LinkedIn rejected your token. Please reconnect in Settings.",
              },
              401,
            );
          }
          return jsonResponse(
            { error: "LinkedIn rejected the post.", details: txt },
            502,
          );
        }

        const postId = ugcResp.headers.get("x-restli-id") ?? "";
        return jsonResponse({ success: true, postId });
      },
    },
  },
});
