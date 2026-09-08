import { Skeleton } from "@/components/ui/skeleton";
import { SidebarShell } from "@/components/workspace/SidebarShell";

export function SettingsSkeleton() {
  return (
    <SidebarShell mobileTitle="Settings">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-8 sm:mb-10">
          <Skeleton className="h-3 w-20 mb-3" />
          <Skeleton className="h-8 w-64" />
        </div>

        {/* Tabs skeleton */}
        <div className="flex gap-2 mb-6">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>

        {/* Section skeleton */}
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-6 py-5 border-b border-border">
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-24 w-full rounded-md" />
            </div>
          </div>
        </div>
      </main>
    </SidebarShell>
  );
}
