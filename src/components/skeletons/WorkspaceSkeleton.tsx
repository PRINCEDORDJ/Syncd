import { Skeleton } from "@/components/ui/skeleton";

export function WorkspaceSkeleton() {
  return (
    <div className="h-dvh bg-background text-ink flex overflow-hidden">
      {/* Sidebar skeleton */}
      <div className="w-60 shrink-0 bg-sidebar border-r border-border flex flex-col">
        <div className="h-12 shrink-0 border-b border-border flex items-center gap-2 px-2.5">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="shrink-0 py-1.5 px-2">
          <Skeleton className="h-2.5 w-20 mb-1" />
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg mt-1" />
          <Skeleton className="h-8 w-full rounded-lg mt-1" />
        </div>
        <div className="flex-1 min-h-0 py-3 px-2 space-y-1.5">
          <Skeleton className="h-2.5 w-12 mb-1" />
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-7 w-full rounded-lg" />
          ))}
        </div>
      </div>

      {/* Canvas skeleton */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-12 shrink-0 border-b border-border flex items-center gap-3 px-5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex-1 px-5 py-8 space-y-3.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-9/12" />
        </div>
        <div className="shrink-0 h-12 border-t border-border" />
      </div>

      {/* AI sidechat skeleton */}
      <div className="w-[380px] shrink-0 bg-subtle/20 border-l border-border flex flex-col">
        <div className="h-12 shrink-0 border-b border-border flex items-center gap-2 px-4">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex-1 p-4 space-y-3">
          <Skeleton className="h-16 w-2/3 rounded-xl" />
          <Skeleton className="h-10 w-3/4 rounded-xl" />
          <Skeleton className="h-12 w-2/3 rounded-xl" />
        </div>
        <Skeleton className="h-24 mx-3 mb-3 rounded-xl" />
      </div>
    </div>
  );
}
