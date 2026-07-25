import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishToLinkedIn } from "@/lib/linkedin-publish.server";

export const Route = createFileRoute("/api/public/scheduler")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Simple shared-secret check (uses Supabase anon key from apikey header)
        const providedKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || providedKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Cleanup any expired LinkedIn connections (triggers Realtime DELETE events)
        await supabaseAdmin.rpc("expire_linkedin_connections" as any);

        const nowIso = new Date().toISOString();
        const { data: due, error } = await supabaseAdmin
          .from("drafts")
          .select("id, user_id, content, images")
          .eq("schedule_status", "scheduled")
          .lte("scheduled_at", nowIso)
          .limit(20);

        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }
        if (!due?.length) return Response.json({ processed: 0, expiredCleaned: true });

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
            const result = await publishToLinkedIn(d.user_id, d.content, imgs);
            if (result.ok) {
              ok++;
              await supabaseAdmin
                .from("drafts")
                .update({
                  published: true,
                  schedule_status: "published",
                  schedule_error: null,
                })
                .eq("id", d.id);
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

        return Response.json({ processed: due.length, published: ok, failed });
      },
    },
  },
});