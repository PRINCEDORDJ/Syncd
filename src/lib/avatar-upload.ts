import { supabase } from "@/integrations/supabase/client";

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export async function uploadAvatar(userId: string, file: File): Promise<{ url: string }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Image must be under 5MB.");
  }
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = pub.publicUrl;
  const { error: profErr } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, avatar_url: url }, { onConflict: "user_id" });
  if (profErr) throw new Error(`Failed to save: ${profErr.message}`);
  return { url };
}

export async function removeAvatar(userId: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, avatar_url: null }, { onConflict: "user_id" });
  if (error) throw new Error(`Failed: ${error.message}`);
}