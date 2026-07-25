import { Skeleton } from "@/components/ui/skeleton";
import { SiteNav } from "@/components/SiteNav";

export function WorkspaceSkeleton() {
  return (
    <div className="min-h-dvh bg-background text-ink flex flex-col">
      <SiteNav />

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-8">
        {/* Page header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5 sm:mb-6">
          <div>
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-7 sm:h-8 w-64 sm:w-80" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-36" />
          </div>
        </div>

        {/* Workspace card skeleton */}
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          {/* Card Toolbar Header Skeleton */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 sm:px-5 py-3 border-b border-border bg-subtle/40">
            <div className="flex items-center gap-2">
              <Skeleton className="size-5 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-6 w-28 rounded-md" />
              <Skeleton className="h-6 w-24 rounded-md" />
              <Skeleton className="h-6 w-24 rounded-md" />
            </div>
          </div>

          {/* Grid Layout: Left raw input panel, Right canvas */}
          <div className="grid grid-cols-12 min-h-[500px]">
            {/* Left Panel */}
            <div className="col-span-12 md:col-span-4 border-b md:border-b-0 md:border-r border-border p-4 sm:p-5 flex flex-col gap-4 bg-subtle/20">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-48 w-full rounded-md" />
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Skeleton className="size-8 rounded-md" />
                  <Skeleton className="size-8 rounded-md" />
                  <Skeleton className="size-8 rounded-md" />
                </div>
                <Skeleton className="h-9 w-32 rounded-md" />
              </div>
            </div>

            {/* Right Canvas */}
            <div className="col-span-12 md:col-span-8 p-4 sm:p-6 md:p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border/40">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-3/4 mb-4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-9/12" />
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-border/40">
                <Skeleton className="h-8 w-24 rounded-md" />
                <Skeleton className="h-8 w-28 rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
