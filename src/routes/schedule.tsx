import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { CalendarClock, CircleAlert, RotateCcw, Clock, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace-context";
import { useCredits } from "@/hooks/useCredits";
import { PLAN_LIMITS } from "@/lib/plans";
import { SidebarShell } from "@/components/workspace/SidebarShell";
import { DraftsSkeleton, DraftItemSkeleton } from "@/components/skeletons/DraftsSkeleton";
import { useWorkspaceGate } from "@/lib/workspace-gate";

export const Route = createFileRoute("/schedule")({
  head: () => ({
    meta: [
      { title: "Schedule — Syncd" },
      { name: "description", content: "Posts scheduled to publish to LinkedIn." },
    ],
  }),
  component: ScheduleGate,
});

type ScheduledRow = {
  id: string;
  title: string;
  content: string;
  tone: string;
  char_count: number;
  images: string[];
  thread_id?: string | null;
  scheduled_at: string | null;
  schedule_status: string | null;
  schedule_error: string | null;
  updated_at: string;
};

const UPCOMING_STATUSES = ["scheduled", "pending", "publishing"];

function ScheduleGate() {
  const ready = useWorkspaceGate("/schedule");

  if (!ready) {
    return <DraftsSkeleton />;
  }

  return <ScheduleList />;
}

function ScheduleList() {
  const { user } = useAuth();
  const { activeWorkspaceId, loadDraft } = useWorkspace();
  const navigate = useNavigate();
  const credits = useCredits();
  const allowsScheduling = credits.isAdmin || PLAN_LIMITS[credits.plan]?.scheduling;

  const [rows, setRows] = useState<ScheduledRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !activeWorkspaceId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("drafts")
        .select(
          "id, title, content, tone, char_count, images, thread_id, scheduled_at, schedule_status, schedule_error, updated_at",
        )
        .eq("workspace_id", activeWorkspaceId)
        .in("schedule_status", [...UPCOMING_STATUSES, "failed"])
        .order("scheduled_at", { ascending: true });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRows([]);
      } else {
        setRows(
          (data ?? []).map((r) => ({
            ...r,
            images: Array.isArray(r.images) ? (r.images as string[]) : [],
            scheduled_at: (r as { scheduled_at?: string | null }).scheduled_at ?? null,
            schedule_status: (r as { schedule_status?: string | null }).schedule_status ?? null,
            schedule_error: (r as { schedule_error?: string | null }).schedule_error ?? null,
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, activeWorkspaceId]);

  const { upcoming, failed } = useMemo(() => {
    const up: ScheduledRow[] = [];
    const fl: ScheduledRow[] = [];
    for (const r of rows ?? []) {
      if (r.schedule_status === "failed") fl.push(r);
      else up.push(r);
    }
    up.sort(
      (a, b) => new Date(a.scheduled_at ?? 0).getTime() - new Date(b.scheduled_at ?? 0).getTime(),
    );
    return { upcoming: up, failed: fl };
  }, [rows]);

  function openDraft(r: ScheduledRow) {
    loadDraft({
      id: r.id,
      content: r.content,
      title: r.title,
      tone: r.tone,
      images: r.images,
      attachments: [],
      raw_input: "",
      thread_id: r.thread_id ?? null,
    });
    navigate({ to: "/app" });
  }

  async function cancelSchedule(r: ScheduledRow) {
    if (!user || busyId) return;
    setBusyId(r.id);
    setError(null);
    const { error: err } = await supabase
      .from("drafts")
      .update({ scheduled_at: null, schedule_status: "draft", schedule_error: null })
      .eq("id", r.id)
      .eq("user_id", user.id);
    if (err) {
      setError(err.message);
      setBusyId(null);
      return;
    }
    setRows((prev) => (prev ? prev.filter((row) => row.id !== r.id) : prev));
    setBusyId(null);
  }

  async function retrySchedule(r: ScheduledRow) {
    if (!user || busyId) return;
    setBusyId(r.id);
    setError(null);
    const { error: err } = await supabase
      .from("drafts")
      .update({ schedule_status: "scheduled", schedule_error: null })
      .eq("id", r.id)
      .eq("user_id", user.id);
    if (err) {
      setError(err.message);
      setBusyId(null);
      return;
    }
    setRows((prev) => {
      if (!prev) return prev;
      return prev.map((row) =>
        row.id === r.id ? { ...row, schedule_status: "scheduled", schedule_error: null } : row,
      );
    });
    setBusyId(null);
  }

  function statusBadge(r: ScheduledRow) {
    if (r.schedule_status === "publishing") {
      return (
        <span className="px-1.5 py-0.5 rounded border bg-accent-cyan/10 border-accent-cyan/30 text-cyan-600 dark:text-cyan-400 inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-cyan-500 animate-pulse" />
          Publishing
        </span>
      );
    }
    const overdue = r.scheduled_at && isPast(new Date(r.scheduled_at));
    return (
      <span
        className={`px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
          overdue
            ? "bg-destructive/10 border-destructive/30 text-destructive"
            : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
        }`}
      >
        <Clock className="size-3" />
        {overdue ? "Overdue" : "Scheduled"}
      </span>
    );
  }

  const isEmpty = rows !== null && upcoming.length === 0 && failed.length === 0;

  return (
    <SidebarShell mobileTitle="Schedule">
      <div className="h-full min-h-0 w-full overflow-y-auto">
        <main className="w-full max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
          <div className="mb-6 sm:mb-8">
            <p className="text-[10px] sm:text-[11px] font-mono text-muted-foreground uppercase tracking-[0.15em] mb-2">
              Library
            </p>
            <h1 className="text-xl sm:text-2xl md:text-3xl tracking-[-0.02em] font-semibold leading-tight">
              Schedule
            </h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {rows === null
                ? "Loading scheduled posts…"
                : upcoming.length === 0 && failed.length === 0
                  ? "Nothing scheduled yet."
                  : `${upcoming.length} upcoming · ${failed.length} failed`}
            </p>
          </div>

          {!allowsScheduling && (
            <div className="mb-4 px-3 py-2.5 rounded-md bg-subtle border border-border text-[13px] text-muted-foreground">
              Your current plan doesn&apos;t include scheduling.{" "}
              <Link to="/pricing" className="underline hover:text-ink font-medium">
                Upgrade
              </Link>{" "}
              to schedule posts from the workspace.
            </div>
          )}

          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-md bg-destructive/5 border border-destructive/20 text-[13px] text-destructive">
              {error}
            </div>
          )}

          {rows === null ? (
            <ul className="space-y-3">
              <DraftItemSkeleton />
              <DraftItemSkeleton />
              <DraftItemSkeleton />
            </ul>
          ) : isEmpty ? (
            <div className="border border-dashed border-border rounded-xl p-10 text-center">
              <CalendarClock className="size-6 mx-auto text-muted-foreground mb-3" />
              <p className="text-[14px] text-muted-foreground mb-4">
                No posts scheduled. Open a draft in the workspace and use the calendar button to
                schedule it.
              </p>
              <Link
                to="/app"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-ink text-surface text-[13px] font-medium hover:bg-ink/90"
              >
                Open workspace →
              </Link>
            </div>
          ) : (
            <div className="space-y-8">
              {failed.length > 0 && (
                <section>
                  <h2 className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-3">
                    Failed
                  </h2>
                  <ul className="space-y-3">
                    {failed.map((r) => (
                      <li
                        key={r.id}
                        className="border border-destructive/20 rounded-xl bg-card p-4 sm:p-5 hover:border-ink/30 transition-colors cursor-pointer"
                        onClick={() => openDraft(r)}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-medium text-ink text-[15px] truncate">
                              {r.title || "Untitled draft"}
                            </h3>
                            <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-muted-foreground flex-wrap">
                              <span className="px-1.5 py-0.5 rounded border bg-destructive/10 border-destructive/30 text-destructive inline-flex items-center gap-1">
                                <CircleAlert className="size-3" />
                                Failed
                              </span>
                              {r.scheduled_at && (
                                <span>
                                  {format(new Date(r.scheduled_at), "MMM d, yyyy · h:mm a")}
                                </span>
                              )}
                              <span>·</span>
                              <span>{r.char_count} ch</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void retrySchedule(r);
                              }}
                              className="inline-flex items-center gap-1 h-7 px-2 rounded border border-border bg-card text-[12px] font-medium text-ink hover:bg-subtle disabled:opacity-50"
                              title="Retry scheduling"
                            >
                              <RotateCcw className="size-3" />
                              Retry
                            </button>
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void cancelSchedule(r);
                              }}
                              className="inline-flex items-center gap-1 h-7 px-2 rounded border border-border bg-card text-[12px] font-medium text-muted-foreground hover:text-destructive hover:border-destructive/30 disabled:opacity-50"
                              title="Remove from schedule"
                            >
                              <X className="size-3" />
                              Cancel
                            </button>
                          </div>
                        </div>
                        {r.schedule_error && (
                          <p className="mb-2 text-[12px] text-destructive/90 leading-relaxed">
                            {r.schedule_error}
                          </p>
                        )}
                        <p className="text-[14px] text-ink/80 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                          {r.content}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h2 className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-3">
                  Upcoming
                </h2>
                {upcoming.length === 0 ? (
                  <div className="border border-dashed border-border rounded-xl p-8 text-center">
                    <p className="text-[13px] text-muted-foreground">
                      Nothing upcoming. Schedule a post from the workspace.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {upcoming.map((r) => {
                      const when = r.scheduled_at ? new Date(r.scheduled_at) : null;
                      const overdue = when ? isPast(when) : false;
                      return (
                        <li
                          key={r.id}
                          className="border border-border rounded-xl bg-card p-4 sm:p-5 hover:border-ink/30 transition-colors cursor-pointer"
                          onClick={() => openDraft(r)}
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-medium text-ink text-[15px] truncate">
                                {r.title || "Untitled draft"}
                              </h3>
                              <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-muted-foreground flex-wrap">
                                {statusBadge(r)}
                                {when && (
                                  <span>
                                    {format(when, "EEE, MMM d · h:mm a")}
                                    {" · "}
                                    <span className={overdue ? "text-destructive" : ""}>
                                      {formatDistanceToNow(when, { addSuffix: true })}
                                    </span>
                                  </span>
                                )}
                                <span>·</span>
                                <span>{r.char_count} ch</span>
                                {r.images.length > 0 && (
                                  <>
                                    <span>·</span>
                                    <span>{r.images.length} img</span>
                                  </>
                                )}
                              </div>
                            </div>
                            {r.schedule_status !== "publishing" && (
                              <button
                                type="button"
                                disabled={busyId === r.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void cancelSchedule(r);
                                }}
                                className="inline-flex items-center gap-1 h-7 px-2 rounded border border-border bg-card text-[12px] font-medium text-muted-foreground hover:text-destructive hover:border-destructive/30 disabled:opacity-50 shrink-0"
                                title="Remove from schedule"
                              >
                                <X className="size-3" />
                                Cancel
                              </button>
                            )}
                          </div>
                          <p className="text-[14px] text-ink/80 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                            {r.content}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </SidebarShell>
  );
}
