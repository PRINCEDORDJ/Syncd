import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";
import { CreditsProvider } from "@/lib/credits-context";
import { WorkspaceProvider } from "@/lib/workspace-context";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Syncd" },
      { name: "description", content: "Syncd integrates LinkedIn to streamline content sharing and profile management." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Syncd" },
      { property: "og:description", content: "Syncd integrates LinkedIn to streamline content sharing and profile management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Syncd" },
      { name: "twitter:description", content: "Syncd integrates LinkedIn to streamline content sharing and profile management." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/32914e93-a8e9-4b04-90b7-6eb0de114462/id-preview-49abd114--cfec36dd-d218-4e4e-9ba5-2ddb31f007a5.lovable.app-1776472776957.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/32914e93-a8e9-4b04-90b7-6eb0de114462/id-preview-49abd114--cfec36dd-d218-4e4e-9ba5-2ddb31f007a5.lovable.app-1776472776957.png" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <CreditsProvider>
        {/* Global so the persistent sidebar's draft list shares one workspace
            state with the canvas across /app, /drafts and /settings. */}
        <WorkspaceProvider>
          <Outlet />
        </WorkspaceProvider>
      </CreditsProvider>
    </AuthProvider>
  );
}
