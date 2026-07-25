import { Skeleton } from "@/components/ui/skeleton";
import { SiteNav } from "@/components/SiteNav";

export function DraftItemSkeleton() {
  return (
    <li className="border border-border rounded-xl bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <div className="flex items-center gap-2 flex-wrap">
            <Skeleton className="h-4 w-16 rounded" />
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-4 w-12 rounded" />
            <Skeleton className="h-4 w-24 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
        </div>
      </div>
      <div className="space-y-1.5 pt-1">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
    </li>
  );
}

export function DraftsSkeleton() {
  return (
    <div className="min-h-dvh bg-background text-ink flex flex-col">
      <SiteNav />

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <Skeleton className="h-3 w-24 mb-2" />
            <Skeleton className="h-8 w-56" />
          </div>
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>

        {/* Filters Skeleton */}
        <div className="flex items-center gap-2 mb-6">
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>

        {/* Draft List Skeleton */}
        <ul className="space-y-3">
          <DraftItemSkeleton />
          <DraftItemSkeleton />
          <DraftItemSkeleton />
        </ul>
      </main>
    </div>
  );
}
