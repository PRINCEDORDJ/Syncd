import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/lib/supabase-admin.server";
import { publishToLinkedIn } from "@/lib/linkedin-publish.server";
import {
  recordPublishedPost,
  refreshLinkedInPostStats,
} from "@/lib/linkedin-stats.server";

export const Route = createFileRoute("/api/public/scheduler")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Simple shared-secret check (uses Supabase anon key from apikey header)
        const providedKey = request.headers.get("apikey") ?? "";
        const { getSupabasePublishableKey } = await import("@/lib/supabase-env.server");
        let expected = "";
        try {
          expected = getSupabasePublishableKey();
        } catch {
          expected = "";
        }
        if (!expected || providedKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Cleanup any expired LinkedIn connections (triggers Realtime DELETE events)
        await supabaseAdmin.rpc("expire_linkedin_connections" as any);

        // Best-effort refresh of engagement stats for recently published posts.
        // Bounded (≤5 API calls/tick) and never blocks publishing below.
        const stats = await refreshLinkedInPostStats();

        const nowIso = new Date().toISOString();
        const { data: due, error } = await supabaseAdmin
          .from("drafts")
          .select("id, user_id, content, images, linkedin_connection_id")
          .in("schedule_status", ["scheduled", "pending"])
          .lte("scheduled_at", nowIso)
          .limit(20);

        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }
        if (!due?.length) {
          return Response.json({
            processed: 0,
            expiredCleaned: true,
            statsRefreshed: stats.refreshed,
          });
        }

        let ok = 0;
        let failed = 0;
        for (const d of due) {
          // claim the row
          await supabaseAdmin
            .from("drafts")
            .update({ schedule_status: "publishing" })
            .eq("id", d.id);

          try {
            const imgs = Array.isArray(d.images) ? (d.images as string[]) : [];
            const connId =
              typeof d.linkedin_connection_id === "string" && d.linkedin_connection_id
                ? d.linkedin_connection_id
                : null;
            const result = await publishToLinkedIn(d.user_id, d.content, imgs, connId);
            if (result.ok) {
              ok++;
              // Persist the returned post id (normalized to a full URN) and
              // seed its stats row so engagement tracking starts on the next
              // scheduler tick.
              await supabaseAdmin
                .from("drafts")
                .update({
                  published: true,
                  schedule_status: "published",
                  schedule_error: null,
                })
                .eq("id", d.id);
              if (result.postId) {
                await recordPublishedPost({
                  draftId: d.id,
                  userId: d.user_id,
                  connectionId: connId,
                  postId: result.postId,
                });
              }
            } else {
              failed++;
              await supabaseAdmin
                .from("drafts")
                .update({
                  schedule_status: "failed",
                  schedule_error: result.error.slice(0, 500),
                })
                .eq("id", d.id);
            }
          } catch (e) {
            failed++;
            await supabaseAdmin
              .from("drafts")
              .update({
                schedule_status: "failed",
                schedule_error: (e as Error).message.slice(0, 500),
              })
              .eq("id", d.id);
          }
        }

        return Response.json({
          processed: due.length,
          published: ok,
          failed,
          statsRefreshed: stats.refreshed,
        });
      },
    },
  },
});
