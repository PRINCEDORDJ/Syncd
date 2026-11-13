import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, isAfter, subDays } from "date-fns";
import {
  BarChart3,
  ThumbsUp,
  MessageCircle,
  Repeat2,
  ExternalLink,
  Calendar,
  PenLine,
  TrendingUp,
  X,
  Sparkles,
  ArrowRight,
  Filter,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { AttachmentItem } from "@/lib/image-validation";
import { useWorkspace } from "@/lib/workspace-context";
import { SidebarShell } from "@/components/workspace/SidebarShell";
import { useWorkspaceGate } from "@/lib/workspace-gate";
import { DraftsSkeleton } from "@/components/skeletons/DraftsSkeleton";

export const Route = createFileRoute("/analytics")({
  validateSearch: (search: Record<string, unknown>): { postId?: string } => ({
    postId: search.postId != null ? String(search.postId) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Analytics — Syncd" },
      { name: "description", content: "LinkedIn post performance and engagement metrics." },
    ],
  }),
  component: AnalyticsGate,
});

type PublishedPost = {
  id: string;
  title: string;
  content: string;
  tone: string;
  char_count: number;
  published_at: string | null;
  updated_at: string;
  linkedin_post_urn: string | null;
  images: string[];
  attachments: unknown[];
  raw_input: string;
  thread_id?: string | null;
};

type PostStats = {
  draft_id: string;
  reactions: number;
  comments: number;
  shares: number;
  reposts: number;
  fetched_at: string;
};

type TimeRange = "7d" | "30d" | "all";

function AnalyticsGate() {
  const ready = useWorkspaceGate("/analytics");

  if (!ready) {
    return <DraftsSkeleton />;
  }

  return <AnalyticsDashboard />;
}

function AnalyticsDashboard() {
  const { user } = useAuth();
  const { activeWorkspaceId, loadDraft } = useWorkspace();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [posts, setPosts] = useState<PublishedPost[] | null>(null);
  const [statsMap, setStatsMap] = useState<Record<string, PostStats>>({});
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  const selectedPostId = search.postId;

  // 1. Fetch published posts for active workspace
  useEffect(() => {
    if (!user || !activeWorkspaceId) {
      setPosts([]);
      setStatsMap({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("drafts")
        .select(
          "id, title, content, tone, char_count, published_at, updated_at, linkedin_post_urn, images, attachments, raw_input, thread_id",
        )
        .eq("workspace_id", activeWorkspaceId)
        .eq("published", true)
        .order("published_at", { ascending: false });

      if (cancelled) return;

      if (error || !data) {
        setPosts([]);
        setStatsMap({});
        setLoading(false);
        return;
      }

      const rows: PublishedPost[] = data.map((d) => ({
        id: d.id,
        title: d.title,
        content: d.content,
        tone: d.tone,
        char_count: d.char_count,
        published_at: d.published_at,
        updated_at: d.updated_at,
        linkedin_post_urn: d.linkedin_post_urn,
        images: Array.isArray(d.images) ? (d.images as string[]) : [],
        attachments: Array.isArray(d.attachments) ? (d.attachments as unknown[]) : [],
        raw_input: d.raw_input || "",
        thread_id: d.thread_id,
      }));

      setPosts(rows);

      // 2. Fetch engagement stats for published posts
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const { data: statsData } = await supabase
          .from("linkedin_post_stats")
          .select("draft_id, reactions, comments, shares, reposts, fetched_at")
          .in("draft_id", ids);

        if (!cancelled && statsData) {
          const map: Record<string, PostStats> = {};
          for (const s of statsData) {
            map[s.draft_id] = {
              draft_id: s.draft_id,
              reactions: s.reactions ?? 0,
              comments: s.comments ?? 0,
              shares: s.shares ?? 0,
              reposts: s.reposts ?? 0,
              fetched_at: s.fetched_at,
            };
          }
          setStatsMap(map);
        }
      } else {
        setStatsMap({});
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, activeWorkspaceId]);

  // Filter posts by time range
  const filteredPosts = useMemo(() => {
    if (!posts) return [];
    if (timeRange === "all") return posts;

    const days = timeRange === "7d" ? 7 : 30;
    const cutoff = subDays(new Date(), days);

    return posts.filter((p) => {
      const dateStr = p.published_at || p.updated_at;
      if (!dateStr) return false;
      return isAfter(new Date(dateStr), cutoff);
    });
  }, [posts, timeRange]);

  // Specific selected post (if deep linked via ?postId=...)
  const selectedPost = useMemo(() => {
    if (!selectedPostId || !posts) return null;
    return posts.find((p) => p.id === selectedPostId) ?? null;
  }, [selectedPostId, posts]);

  // Aggregated metrics
  const metrics = useMemo(() => {
    const list = selectedPost ? [selectedPost] : filteredPosts;
    let reactions = 0;
    let comments = 0;
    let shares = 0;
    let reposts = 0;
    let trackedPostsCount = 0;

    for (const p of list) {
      const s = statsMap[p.id];
      if (s) {
        reactions += s.reactions;
        comments += s.comments;
        shares += s.shares;
        reposts += s.reposts;
        trackedPostsCount++;
      }
    }

    const totalSharesAndReposts = shares + reposts;
    const totalEngagements = reactions + comments + totalSharesAndReposts;
    const avgEngagement = list.length > 0 ? (totalEngagements / list.length).toFixed(1) : "0.0";

    return {
      postCount: list.length,
      trackedPostsCount,
      reactions,
      comments,
      shares: totalSharesAndReposts,
      totalEngagements,
      avgEngagement,
    };
  }, [selectedPost, filteredPosts, statsMap]);

  // Timeline chart data
  const chartData = useMemo(() => {
    const list = [...filteredPosts].reverse();
    return list.map((p) => {
      const s = statsMap[p.id] || { reactions: 0, comments: 0, shares: 0, reposts: 0 };
      const dateStr = p.published_at || p.updated_at;
      const formattedDate = dateStr ? format(new Date(dateStr), "MMM d") : "Unknown";
      const total = s.reactions + s.comments + s.shares + s.reposts;

      return {
        id: p.id,
        name: formattedDate,
        title: p.title || "Untitled draft",
        reactions: s.reactions,
        comments: s.comments,
        shares: s.shares + s.reposts,
        total,
      };
    });
  }, [filteredPosts, statsMap]);

  // Engagement distribution data
  const distributionData = useMemo(() => {
    return [
      { name: "Reactions", count: metrics.reactions, fill: "#06b6d4" },
      { name: "Comments", count: metrics.comments, fill: "#3b82f6" },
      { name: "Shares", count: metrics.shares, fill: "#8b5cf6" },
    ];
  }, [metrics]);

  function clearPostFilter() {
    void navigate({ to: "/analytics", search: {} });
  }

  function handleOpenInCanvas(post: PublishedPost) {
    loadDraft({
      id: post.id,
      content: post.content,
      title: post.title,
      tone: post.tone,
      images: post.images,
      attachments: post.attachments as unknown as AttachmentItem[],
      raw_input: post.raw_input,
      thread_id: post.thread_id ?? null,
      published: true,
    });
    void navigate({ to: "/app" });
  }

  return (
    <SidebarShell mobileTitle="Analytics">
      <div className="h-full min-h-0 w-full overflow-y-auto">
        <main className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 sm:mb-8">
            <div>
              <p className="text-[10px] sm:text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-2">
                Insights & Performance
              </p>
              <h1 className="text-xl sm:text-2xl md:text-3xl tracking-[-0.02em] font-semibold leading-tight text-ink">
                LinkedIn Analytics
              </h1>
            </div>

            {/* Time range switcher */}
            <div className="flex items-center gap-1.5 self-start sm:self-auto bg-card border border-border rounded-lg p-1">
              {(["7d", "30d", "all"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setTimeRange(r)}
                  className={`h-7 px-3 rounded text-[12px] font-medium transition-colors ${
                    timeRange === r
                      ? "bg-ink text-surface shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-ink"
                  }`}
                >
                  {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : "All Time"}
                </button>
              ))}
            </div>
          </div>

          {/* Deep link post filter alert */}
          {selectedPost && (
            <div className="mb-6 p-4 rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="p-1.5 rounded-md bg-accent-cyan/15 text-accent-cyan shrink-0">
                  <Filter className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-accent-cyan font-medium">
                      Post Focus
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {selectedPost.published_at
                        ? format(new Date(selectedPost.published_at), "MMM d, yyyy")
                        : "Published"}
                    </span>
                  </div>
                  <h2 className="text-sm font-semibold text-ink truncate mt-0.5">
                    {selectedPost.title || "Untitled draft"}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenInCanvas(selectedPost)}
                  className="h-8 px-3 rounded-md bg-card border border-border text-ink text-xs font-medium hover:bg-subtle transition-colors inline-flex items-center gap-1.5"
                >
                  <PenLine className="size-3.5" />
                  Edit in Canvas
                </button>
                <button
                  type="button"
                  onClick={clearPostFilter}
                  className="h-8 px-3 rounded-md bg-ink text-surface text-xs font-medium hover:bg-ink/90 transition-colors inline-flex items-center gap-1"
                >
                  <X className="size-3.5" />
                  View all posts
                </button>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-28 rounded-xl border border-border bg-card/60 animate-pulse"
                  />
                ))}
              </div>
              <div className="h-64 rounded-xl border border-border bg-card/60 animate-pulse" />
            </div>
          ) : !posts || posts.length === 0 ? (
            /* Empty state */
            <div className="border border-dashed border-border rounded-xl p-10 sm:p-14 text-center bg-card/20">
              <div className="size-12 rounded-full bg-subtle mx-auto flex items-center justify-center text-muted-foreground mb-4">
                <BarChart3 className="size-6 text-accent-cyan" />
              </div>
              <h2 className="text-base sm:text-lg font-semibold text-ink mb-1">
                No published posts yet
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                Publish posts to LinkedIn through Syncd to track reactions, comments, shares, and
                audience engagement automatically.
              </p>
              <Link
                to="/app"
                className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-ink text-surface text-xs font-medium hover:bg-ink/90 transition-colors"
              >
                Create your first post
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ) : (
            <div className="space-y-6 sm:space-y-8">
              {/* KPI Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* Total Published */}
                <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
                  <div className="flex items-center justify-between text-muted-foreground mb-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider">
                      {selectedPost ? "Selected Post" : "Published Posts"}
                    </span>
                    <Sparkles className="size-4 text-accent-cyan" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-semibold tabular-nums text-ink">
                    {metrics.postCount}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {metrics.trackedPostsCount} tracked on LinkedIn
                  </div>
                </div>

                {/* Total Engagements */}
                <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
                  <div className="flex items-center justify-between text-muted-foreground mb-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider">
                      Total Engagements
                    </span>
                    <TrendingUp className="size-4 text-emerald-500" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-semibold tabular-nums text-ink">
                    {metrics.totalEngagements}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    ~{metrics.avgEngagement} per post
                  </div>
                </div>

                {/* Reactions */}
                <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
                  <div className="flex items-center justify-between text-muted-foreground mb-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider">
                      Reactions
                    </span>
                    <ThumbsUp className="size-4 text-cyan-500" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-semibold tabular-nums text-ink">
                    {metrics.reactions}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">Likes & reactions</div>
                </div>

                {/* Comments & Shares */}
                <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
                  <div className="flex items-center justify-between text-muted-foreground mb-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider">
                      Comments & Shares
                    </span>
                    <MessageCircle className="size-4 text-blue-500" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-semibold tabular-nums text-ink">
                    {metrics.comments + metrics.shares}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {metrics.comments} comments · {metrics.shares} shares
                  </div>
                </div>
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Timeline Chart */}
                <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-semibold text-ink">Engagement Over Time</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Total interactions across published posts
                      </p>
                    </div>
                  </div>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="engagementGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="rgba(255,255,255,0.06)"
                        />
                        <XAxis
                          dataKey="name"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "#888", fontSize: 11 }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "#888", fontSize: 11 }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#18181b",
                            borderColor: "rgba(255,255,255,0.1)",
                            borderRadius: "8px",
                            fontSize: "12px",
                            color: "#fff",
                          }}
                          labelFormatter={(val, items) => {
                            const item = items[0]?.payload;
                            return item ? `${item.title} (${item.name})` : val;
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="total"
                          name="Total Engagement"
                          stroke="#06b6d4"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#engagementGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Distribution Bar Chart */}
                <div className="rounded-xl border border-border bg-card p-4 sm:p-6 flex flex-col justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-ink">Interaction Breakdown</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Reactions vs comments vs shares
                    </p>
                  </div>

                  <div className="h-56 w-full my-auto">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={distributionData}
                        margin={{ top: 20, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="rgba(255,255,255,0.06)"
                        />
                        <XAxis
                          dataKey="name"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "#888", fontSize: 11 }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "#888", fontSize: 11 }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#18181b",
                            borderColor: "rgba(255,255,255,0.1)",
                            borderRadius: "8px",
                            fontSize: "12px",
                            color: "#fff",
                          }}
                        />
                        <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-center">
                    <div>
                      <div className="text-[10px] text-muted-foreground font-mono">REACTIONS</div>
                      <div className="text-sm font-semibold text-cyan-400 tabular-nums">
                        {metrics.reactions}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground font-mono">COMMENTS</div>
                      <div className="text-sm font-semibold text-blue-400 tabular-nums">
                        {metrics.comments}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground font-mono">SHARES</div>
                      <div className="text-sm font-semibold text-purple-400 tabular-nums">
                        {metrics.shares}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Posts Performance List */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-ink">Post Engagement Breakdown</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Detailed stats per published post in this workspace
                    </p>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground tabular-nums">
                    {filteredPosts.length} posts
                  </span>
                </div>

                <div className="divide-y divide-border">
                  {filteredPosts.map((post) => {
                    const stats = statsMap[post.id] || {
                      reactions: 0,
                      comments: 0,
                      shares: 0,
                      reposts: 0,
                    };
                    const totalShares = stats.shares + stats.reposts;
                    const totalEngagement = stats.reactions + stats.comments + totalShares;
                    const isSelected = selectedPostId === post.id;
                    const linkedInUrl = post.linkedin_post_urn
                      ? `https://www.linkedin.com/feed/update/${encodeURIComponent(post.linkedin_post_urn)}/`
                      : null;

                    return (
                      <div
                        key={post.id}
                        className={`p-4 sm:p-5 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          isSelected
                            ? "bg-accent-cyan/10 border-l-4 border-l-accent-cyan"
                            : "hover:bg-subtle/40"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-mono text-muted-foreground">
                              {post.published_at
                                ? format(new Date(post.published_at), "MMM d, yyyy")
                                : "Published"}
                            </span>
                            <span className="text-muted-foreground text-xs">·</span>
                            <span className="px-1.5 py-0.5 rounded border border-border bg-subtle text-[10px] font-mono text-muted-foreground">
                              {post.tone?.split(" ")[0] || "Standard"}
                            </span>
                            {isSelected && (
                              <span className="px-1.5 py-0.5 rounded bg-accent-cyan/20 text-accent-cyan text-[10px] font-mono font-medium">
                                Selected
                              </span>
                            )}
                          </div>

                          <h3 className="text-sm font-medium text-ink truncate mb-1">
                            {post.title || "Untitled draft"}
                          </h3>

                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {post.content}
                          </p>
                        </div>

                        {/* Metric pills */}
                        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                          <div className="flex items-center gap-3 text-xs font-mono">
                            <span
                              title="Reactions"
                              className="inline-flex items-center gap-1 text-cyan-400 tabular-nums"
                            >
                              <ThumbsUp className="size-3.5" />
                              {stats.reactions}
                            </span>
                            <span
                              title="Comments"
                              className="inline-flex items-center gap-1 text-blue-400 tabular-nums"
                            >
                              <MessageCircle className="size-3.5" />
                              {stats.comments}
                            </span>
                            <span
                              title="Shares"
                              className="inline-flex items-center gap-1 text-purple-400 tabular-nums"
                            >
                              <Repeat2 className="size-3.5" />
                              {totalShares}
                            </span>
                            <span
                              title="Total Engagements"
                              className="inline-flex items-center gap-1 font-semibold text-ink tabular-nums ml-1 px-2 py-0.5 rounded-md bg-subtle border border-border"
                            >
                              {totalEngagement} total
                            </span>
                          </div>

                          {/* Post Actions */}
                          <div className="flex items-center gap-1 border-l border-border pl-3">
                            <button
                              type="button"
                              onClick={() => handleOpenInCanvas(post)}
                              title="Open in Canvas"
                              className="p-1.5 rounded-md text-muted-foreground hover:text-ink hover:bg-subtle transition-colors"
                            >
                              <PenLine className="size-4" />
                            </button>

                            {linkedInUrl && (
                              <a
                                href={linkedInUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View on LinkedIn"
                                className="p-1.5 rounded-md text-muted-foreground hover:text-ink hover:bg-subtle transition-colors"
                              >
                                <ExternalLink className="size-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </SidebarShell>
  );
}
