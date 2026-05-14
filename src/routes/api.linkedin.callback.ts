import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const REDIRECT_URI_PATH = "/api/linkedin/callback";

function getOrigin(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export const Route = createFileRoute("/api/linkedin/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.LINKEDIN_CLIENT_ID;
        const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return new Response("LinkedIn is not configured.", { status: 500 });
        }

        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");

        if (errorParam) {
          throw redirect({
            href: `/settings?linkedin_error=${encodeURIComponent(errorParam)}`,
          });
        }
        if (!code || !state) {
          return new Response("Missing code or state.", { status: 400 });
        }

        // Validate state
        const { data: stateRow, error: stateErr } = await supabaseAdmin
          .from("linkedin_oauth_states")
          .select("user_id, redirect_to")
          .eq("state", state)
          .maybeSingle();
        if (stateErr || !stateRow) {
          return new Response("Invalid OAuth state.", { status: 400 });
        }
        // Consume the state
        await supabaseAdmin.from("linkedin_oauth_states").delete().eq("state", state);

        const redirectUri = `${getOrigin(request)}${REDIRECT_URI_PATH}`;

        // Exchange code for tokens
        const tokenResp = await fetch(
          "https://www.linkedin.com/oauth/v2/accessToken",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code,
              redirect_uri: redirectUri,
              client_id: clientId,
              client_secret: clientSecret,
            }).toString(),
          },
        );
        if (!tokenResp.ok) {
          const t = await tokenResp.text().catch(() => "");
          console.error("[linkedin/callback] token exchange failed", tokenResp.status, t);
          throw redirect({
            href: `/settings?linkedin_error=${encodeURIComponent("token_exchange_failed")}`,
          });
        }
        const tokenJson = (await tokenResp.json()) as {
          access_token: string;
          expires_in: number;
          refresh_token?: string;
          refresh_token_expires_in?: number;
          scope?: string;
        };

        // Fetch userinfo (OpenID)
        const userinfoResp = await fetch("https://api.linkedin.com/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        });
        if (!userinfoResp.ok) {
          const t = await userinfoResp.text().catch(() => "");
          console.error("[linkedin/callback] userinfo failed", userinfoResp.status, t);
          throw redirect({
            href: `/settings?linkedin_error=${encodeURIComponent("userinfo_failed")}`,
          });
        }
        const userinfo = (await userinfoResp.json()) as any;
        
        console.log("[linkedin/callback] userinfo received", {
          sub: userinfo.sub,
          name: userinfo.name,
          hasPicture: !!userinfo.picture,
          email: userinfo.email ? "present" : "absent"
        });

        // OpenID Connect "picture" is standard, but some versions might use "profile_picture" 
        // or have it nested. We try a few common locations.
        const pictureUrl = userinfo.picture || userinfo.profile_picture || null;

        const expiresAt = new Date(
          Date.now() + tokenJson.expires_in * 1000,
        ).toISOString();
        const memberUrn = `urn:li:person:${userinfo.sub}`;

        // Upsert connection
        const { error: upsertErr } = await supabaseAdmin
          .from("linkedin_connections")
          .upsert(
            {
              user_id: stateRow.user_id,
              linkedin_member_urn: memberUrn,
              linkedin_name: userinfo.name ?? null,
              linkedin_picture_url: pictureUrl,
              access_token: tokenJson.access_token,
              refresh_token: tokenJson.refresh_token ?? null,
              expires_at: expiresAt,
              scope: tokenJson.scope ?? null,
            },
            { onConflict: "user_id" },
          );
        if (upsertErr) {
          console.error("[linkedin/callback] upsert failed", upsertErr);
          throw redirect({
            href: `/settings?linkedin_error=${encodeURIComponent("save_failed")}`,
          });
        }

        const dest = stateRow.redirect_to ?? "/settings";
        const sep = dest.includes("?") ? "&" : "?";
        throw redirect({ href: `${dest}${sep}linkedin_connected=1` });
      },
    },
  },
});
