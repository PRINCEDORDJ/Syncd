import { supabaseAdmin } from "@/lib/supabase-admin.server";
import { normalizeLinkedInPostUrn } from "@/lib/linkedin-post-urn";

/**
 * LinkedIn post analytics — latest engagement snapshot per Syncd-published post.
 *
 * Design constraints:
 * - Only posts dispatched through Syncd are tracked (drafts.linkedin_post_urn).
 *   Nothing is imported from LinkedIn, so history stays clean.
 * - Rate-limit friendly: at most `MAX_REFRESHES_PER_TICK` API calls per
 *   scheduler tick, each post refreshed at most hourly for the first 48h after
 *   publish and then daily, and never after HISTORY_WINDOW_DAYS.
 */

/** LinkedIn version header required by /rest/ endpoints. */
const LINKEDIN_VERSION = "202405";

/** Max posts whose stats are refreshed per scheduler tick. */
const MAX_REFRESHES_PER_TICK = 5;

/** Stop refreshing stats this long after publish. */
const HISTORY_WINDOW_DAYS = 30;

/** Posts younger than this refresh hourly; older ones daily. */
const EARLY_WINDOW_HOURS = 48;

/** Refresh interval while the post is still "hot". */
const EARLY_INTERVAL_MINUTES = 60;

/** Refresh interval after the early window. */
const LATER_INTERVAL_HOURS = 24;

/** Backoff after a failed fetch. */
const ERROR_BACKOFF_HOURS = 6;

type DueStatRow = {
  draft_id: string;
  user_id: string;
  linkedin_post_urn: string;
  linkedin_connection_id: string | null;
  drafts: { published_at: string };
  linkedin_connections: {
    id: string;
    access_token: string;
    expires_at: string;
  } | null;
};

type SocialActivityCounts = {
  likesSummary?: { totalLikes?: number };
  commentsSummary?: { totalComments?: number };
  sharesSummary?: { totalShares?: number };
  repostsSummary?: { totalReposts?: number };
};

function nextRefreshAfter(publishedAtMs: number, nowMs: number): string {
  const ageMs = nowMs - publishedAtMs;
  const intervalMs =
    ageMs < EARLY_WINDOW_HOURS * 3_600_000
      ? EARLY_INTERVAL_MINUTES * 60_000
      : LATER_INTERVAL_HOURS * 3_600_000;
  return new Date(nowMs + intervalMs).toISOString();
}

/**
 * After a successful publish: persist the post URN on the draft and seed its
 * stats row (refresh due immediately, first snapshot lands on the next
 * scheduler tick). Safe to call with a null/empty post id — it just no-ops.
 */
export async function recordPublishedPost(params: {
  draftId: string;
  userId: string;
  connectionId: string | null;
  postId: string | null | undefined;
}): Promise<void> {
  const urn = normalizeLinkedInPostUrn(params.postId);
  if (!urn) return;

  await supabaseAdmin
    .from("drafts")
    .update({ linkedin_post_urn: urn, published_at: new Date().toISOString() })
    .eq("id", params.draftId)
    .eq("user_id", params.userId);

  await supabaseAdmin
    .from("linkedin_post_stats")
    .upsert(
      {
        draft_id: params.draftId,
        user_id: params.userId,
        linkedin_connection_id: params.connectionId,
        linkedin_post_urn: urn,
        refresh_after: new Date().toISOString(),
      },
      { onConflict: "draft_id" },
    );
}

/**
 * Refresh engagement stats for up to `limit` posts that are due. Returns the
 * number of posts successfully refreshed. Never throws: stats are best-effort
 * and must never block the scheduler's publishing work.
 */
export async function refreshLinkedInPostStats(
  limit: number = MAX_REFRESHES_PER_TICK,
): Promise<{ refreshed: number; failed: number; skipped: number }> {
  try {
    const nowMs = Date.now();
    const cutoff = new Date(
      nowMs - HISTORY_WINDOW_DAYS * 86_400_000,
    ).toISOString();

    // Posts whose stats exist, are inside the 30-day window, and are due.
    const { data: due, error } = await supabaseAdmin
      .from("linkedin_post_stats")
      .select(
        `draft_id, user_id, linkedin_post_urn, linkedin_connection_id,
         drafts!inner(published_at),
         linkedin_connections!linkedin_post_stats_linkedin_connection_id_fkey(id, access_token, expires_at)`,
      )
      .lte("refresh_after", new Date(nowMs).toISOString())
      .eq("drafts.published", true)
      .gte("drafts.published_at", cutoff)
      .order("refresh_after", { ascending: true })
      .limit(limit);

    if (error) {
      console.error("[linkedin-stats] due query failed", error.message);
      return { refreshed: 0, failed: 0, skipped: 0 };
    }
    if (!due?.length) return { refreshed: 0, failed: 0, skipped: 0 };

    let refreshed = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of due as unknown as DueStatRow[]) {
      const conn = row.linkedin_connections;
      const publishedAtMs = new Date(row.drafts.published_at).getTime();

      // Post token expired/deleted and no usable author token — back off and
      // retry later in case the user reconnects.
      if (!conn || new Date(conn.expires_at).getTime() < nowMs) {
        skipped++;
        await supabaseAdmin
          .from("linkedin_post_stats")
          .update({
            refresh_after: new Date(
              nowMs + ERROR_BACKOFF_HOURS * 3_600_000,
            ).toISOString(),
          })
          .eq("draft_id", row.draft_id);
        continue;
      }

      try {
        const resp = await fetch(
          `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(
            row.linkedin_post_urn,
          )}?action=totalSocialActivityCounts`,
          {
            headers: {
              Authorization: `Bearer ${conn.access_token}`,
              "X-Restli-Protocol-Version": "2.0.0",
              "LinkedIn-Version": LINKEDIN_VERSION,
            },
          },
        );

        if (!resp.ok) {
          const txt = await resp.text().catch(() => "");
          failed++;
          await supabaseAdmin
            .from("linkedin_post_stats")
            .update({
              refresh_after: new Date(
                nowMs + ERROR_BACKOFF_HOURS * 3_600_000,
              ).toISOString(),
              last_refresh_error: `HTTP ${resp.status}: ${txt}`.slice(0, 300),
            })
            .eq("draft_id", row.draft_id);
          continue;
        }

        const counts = (await resp.json()) as SocialActivityCounts;
        refreshed++;
        await supabaseAdmin
          .from("linkedin_post_stats")
          .update({
            reactions: counts.likesSummary?.totalLikes ?? 0,
            comments: counts.commentsSummary?.totalComments ?? 0,
            shares: counts.sharesSummary?.totalShares ?? 0,
            reposts: counts.repostsSummary?.totalReposts ?? 0,
            fetched_at: new Date(nowMs).toISOString(),
            refresh_after: nextRefreshAfter(publishedAtMs, nowMs),
            last_refresh_error: null,
            linkedin_connection_id: conn.id,
          })
          .eq("draft_id", row.draft_id);
      } catch (e) {
        failed++;
        await supabaseAdmin
          .from("linkedin_post_stats")
          .update({
            refresh_after: new Date(
              nowMs + ERROR_BACKOFF_HOURS * 3_600_000,
            ).toISOString(),
            last_refresh_error: (e as Error).message.slice(0, 300),
          })
          .eq("draft_id", row.draft_id);
      }
    }

    return { refreshed, failed, skipped };
  } catch (e) {
    console.error("[linkedin-stats] refresh failed", e);
    return { refreshed: 0, failed: 0, skipped: 0 };
  }
}
