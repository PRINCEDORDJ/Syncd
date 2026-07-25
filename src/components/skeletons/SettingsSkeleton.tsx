import { Skeleton } from "@/components/ui/skeleton";
import { SiteNav } from "@/components/SiteNav";

export function SettingsSkeleton() {
  return (
    <div className="min-h-dvh bg-background text-ink flex flex-col">
      <SiteNav />

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Header Skeleton */}
        <div>
          <Skeleton className="h-3 w-20 mb-2" />
          <Skeleton className="h-8 w-64" />
        </div>

        {/* Profile Card Skeleton */}
        <div className="border border-border rounded-xl bg-card p-6 space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3.5 w-56" />
            </div>
          </div>
          <div className="space-y-3 pt-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        </div>

        {/* Integration Card Skeleton */}
        <div className="border border-border rounded-xl bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3.5 w-64" />
            </div>
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
        </div>

        {/* Plan / Subscription Card Skeleton */}
        <div className="border border-border rounded-xl bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-6 w-20 rounded-md" />
          </div>
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-16 w-full rounded-md" />
        </div>
      </main>
    </div>
  );
}
