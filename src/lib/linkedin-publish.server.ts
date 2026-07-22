import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PublishResult =
  | { ok: true; postId: string }
  | { ok: false; status: number; error: string };

export async function publishToLinkedIn(
  userId: string,
  content: string,
  images: string[] = [],
): Promise<PublishResult> {
  if (!content.trim()) return { ok: false, status: 400, error: "Empty content." };
  if (content.length > 3000)
    return { ok: false, status: 400, error: "Exceeds LinkedIn 3,000 char limit." };

  const { data: conn, error: connErr } = await supabaseAdmin
    .from("linkedin_connections")
    .select("access_token, expires_at, linkedin_member_urn")
    .eq("user_id", userId)
    .maybeSingle();
  if (connErr || !conn)
    return { ok: false, status: 400, error: "LinkedIn not connected." };
  if (new Date(conn.expires_at).getTime() < Date.now())
    return { ok: false, status: 400, error: "LinkedIn connection expired." };

  const safeImages = images
    .filter((v) => typeof v === "string" && v.startsWith("data:image/"))
    .slice(0, 9);

  const mediaAssets: { status: "READY"; media: string }[] = [];
  for (const dataUrl of safeImages) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl);
    if (!match) continue;
    const mime = match[1];
    const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
    const regResp = await fetch(
      "https://api.linkedin.com/v2/assets?action=registerUpload",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${conn.access_token}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
            owner: conn.linkedin_member_urn,
            serviceRelationships: [
              { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
            ],
          },
        }),
      },
    );
    if (!regResp.ok)
      return { ok: false, status: 502, error: "Image register failed." };
    const reg = (await regResp.json()) as {
      value: {
        asset: string;
        uploadMechanism: {
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
            uploadUrl: string;
          };
        };
      };
    };
    const uploadUrl =
      reg.value.uploadMechanism[
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
      ].uploadUrl;
    const upResp = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${conn.access_token}`, "Content-Type": mime },
      body: bytes,
    });
    if (!upResp.ok) return { ok: false, status: 502, error: "Image upload failed." };
    mediaAssets.push({ status: "READY", media: reg.value.asset });
  }

  const shareContent: Record<string, unknown> = {
    shareCommentary: { text: content },
    shareMediaCategory: mediaAssets.length ? "IMAGE" : "NONE",
  };
  if (mediaAssets.length) shareContent.media = mediaAssets;

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
      specificContent: { "com.linkedin.ugc.ShareContent": shareContent },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  if (!ugcResp.ok) {
    const txt = await ugcResp.text().catch(() => "");
    return {
      ok: false,
      status: ugcResp.status === 401 ? 401 : 502,
      error: ugcResp.status === 401 ? "LinkedIn token rejected." : `LinkedIn error: ${txt}`,
    };
  }
  const postId = ugcResp.headers.get("x-restli-id") ?? "";
  return { ok: true, postId };
}