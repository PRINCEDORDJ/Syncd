# SocioSync (Social Sync Connect)

SocioSync is an AI-powered social media management and content orchestration platform. It streamlines the workflow for creators and social media managers by providing a centralized workspace to generate, draft, schedule, and publish content across platforms, with a focus on high-quality AI assistance and direct integrations.

## Key Features
- **AI-Powered Generation**: Integrated AI tools to generate post ideas and full drafts from raw input.
- **Cross-Platform Publishing**: Direct publishing and scheduling, starting with LinkedIn.
- **Drafts Library**: Centralized, searchable library of saved drafts with preview, inline editing, and publishing.
- **Media Management**: Multi-image carousel, video uploads, and document attachments with tier-based storage quotas.
- **Scheduling**: Schedule posts for future publication via an inline date/time picker; auto-published by a scheduler worker.
- **Credits System**: Per-plan monthly credit allowances with daily caps, top-ups, and real-time balance tracking.
- **Team Collaboration**: Team workspace with shared drafts and invite flow (Teams plan).
- **Subscription Management**: Tiered access and payment processing integrated via Polar.
- **Modern Workspace**: Reddit-inspired, compact UX for managing multiple drafts and media attachments.
- **Scalable Backend**: Built on Supabase for real-time data, authentication, secure media storage, and RBAC.

# Project Structure

```text
social-sync-connect/
├── .lovable/                 # Lovable development and planning
│   ├── plan.md              # Project implementation plan
│   └── structure.md         # This file
├── public/                  # Static assets
├── src/                     # Main source code
│   ├── assets/              # Images, fonts, and other assets
│   ├── components/          # React components
│   │   ├── ui/              # shadcn/ui shared components
│   │   ├── BrandMark.tsx    # Brand logo component
│   │   ├── ConfirmDialog.tsx # Reusable confirmation dialog
│   │   ├── CreditBanner.tsx  # Credit-limit banner in workspace
│   │   ├── CreditIndicator.tsx # Nav credit balance indicator
│   │   ├── SchedulePicker.tsx # Date/time picker for scheduling
│   │   ├── SiteFooter.tsx   # Global site footer
│   │   ├── SiteNav.tsx      # Main navigation header
│   │   └── WorkspacePreview.tsx # Dashboard workspace card
│   ├── hooks/               # Custom React hooks
│   │   ├── useCredits.ts    # Real-time credit balance hook
│   │   ├── useStorage.ts    # Storage usage hook
│   │   └── use-mobile.tsx   # Mobile breakpoint hook
│   ├── integrations/        # External service integrations
│   │   ├── lovable/         # Lovable AI Gateway integration
│   │   └── supabase/        # Supabase client, types, auth middleware
│   ├── lib/                 # Utility functions and shared logic
│   │   ├── auth.tsx         # Authentication logic/context
│   │   ├── credits-context.tsx # Real-time credit state provider
│   │   ├── image-validation.ts # Media processing and validation
│   │   ├── plans.ts         # Subscription tier definitions
│   │   ├── subscription.functions.ts # Subscription management server functions
│   │   └── utils.ts         # Tailwind merger and helpers
│   ├── routes/              # TanStack Router page components
│   │   ├── __root.tsx       # Root layout wrapper
│   │   ├── index.tsx        # Landing page
│   │   ├── login.tsx        # Auth page (email + Google OAuth)
│   │   ├── app.tsx          # Main workspace / AI generation
│   │   ├── drafts.tsx       # Drafts library with preview/edit/publish
│   │   ├── settings.tsx     # Tabbed settings (Profile, LinkedIn, Billing, Account, Danger)
│   │   ├── pricing.tsx      # Pricing table with monthly/annual toggle
│   │   ├── methodology.tsx  # Product explanation
│   │   ├── privacy.tsx      # Privacy policy
│   │   ├── terms.tsx        # Terms of service
│   │   ├── auth.tsx         # Auth callback handler
│   │   ├── api.generate.ts  # AI generation endpoint
│   │   ├── api.linkedin.*   # LinkedIn OAuth and publishing
│   │   ├── api.polar.*      # Polar checkout and customer portal
│   │   ├── api.public.polar.webhook.ts # Polar webhook handler
│   │   └── api.public.scheduler.ts # Scheduler worker for scheduled posts
│   ├── routeTree.gen.ts     # Auto-generated TanStack route tree
│   ├── router.tsx           # Router instance configuration
│   └── styles.css           # Global Tailwind & base styles
├── supabase/                # Backend configuration
│   ├── migrations/          # SQL database migrations
│   └── config.toml          # Supabase project settings
├── .env                     # Local environment variables
├── components.json          # shadcn/ui configuration
├── eslint.config.js         # Linting rules
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── vite.config.ts           # Vite build tool configuration
└── wrangler.jsonc           # Cloudflare Pages/Workers config
```

# Database Schema Overview

- **profiles**: User profiles (display name, avatar, preferences, voice style).
- **drafts**: Generated and saved posts with title, content, media, publish status, schedule metadata, and `media_bytes`.
- **images**: LinkedIn-ready uploaded images (legacy path + alt text).
- **subscriptions**: User subscription records with plan, status, billing metadata, and period info.
- **user_credits**: Per-user real-time credit balances (subscription, top-up, daily usage).
- **user_storage**: Cumulative media storage usage per user.
- **credit_transactions**: Immutable ledger of credit grants, usage, refunds, and plan changes.
- **teams**: Team workspace metadata.
- **team_members**: Membership rows linking users to teams with role.
- **user_roles**: RBAC roles (`admin`, `moderator`, `user`) for privileged access.
- **has_role / get_user_plan**: Security definer helpers for server-side authorization.
- **consume_credit / refund_credit / handle_plan_change**: Credit accounting RPCs.
- **check_storage_quota / increment_storage / decrement_storage / sync_draft_storage**: Storage accounting RPCs and trigger.
- **publish_scheduled_post**: Scheduler RPC invoked by the public scheduler route.

# Recent Changes

## 2026-07-24
- **Credit & Subscription Model**: Hardened credit accounting with `consume_credit`, `refund_credit`, and `handle_plan_change` RPCs. Implemented real-time credit balance via `useCredits` and `CreditIndicator` in `SiteNav`. Added `CreditBanner` to the workspace to block/warn generation at plan limits.
- **Storage Quotas**: Added `user_storage` table, `media_bytes` on `drafts`, and RPCs for quota checks and atomic increments/decrements. Enforced tier limits (Free 200 MB / Studio 5 GB / Teams 20 GB) and per-file size limits. Integrated `useStorage` hook into settings and drafts UI.
- **Scheduling UI**: Built `SchedulePicker` component and wired it into the drafts modal. Added scheduled-post badges, cancel-schedule action, and one-minute scheduler worker (`/api/public/scheduler`).
- **Teams Foundation**: Added `teams` and `team_members` tables with shared RLS policies for drafts.
- **Google OAuth**: Added native Supabase Google sign-in on the auth route with same-origin callback.
- **Theme Toggle**: Added light/dark mode toggle in the profile dropdown and mobile menu, persisted to `localStorage`.
- **Settings Redesign**: Converted `settings.tsx` into a tabbed interface (Profile, LinkedIn, Billing, Account, Danger) with avatar upload, voice dictation, storage usage, and plan-specific billing actions.
- **Drafts Enhancements**: Enabled full title/content editing in the draft preview modal, added confirmation dialogs for destructive actions, and improved media carousel/attachment UX.
- **Security**: Restricted security-definer helpers to `service_role` only; kept bucket RLS user-scoped; validated all destructive actions through `ConfirmDialog`.

## 2026-07-12
- **Navbar Redesign**: Cleaned navbar to show only logo + profile. Moved Methodology and Pricing into profile dropdown / settings. Added account dropdown with settings, theme toggle, and sign-out.
- **Avatar Upload**: Replaced avatar URL with file upload and preview modal in settings.
- **Admin RBAC**: Added `user_roles` table and `has_role` helper; promoted `kinlion00@gmail.com` to admin for unlimited access.

## 2026-05-14
- **Documentation**: Created `structure.md` and added comprehensive project description and feature list.
- **Workflow**: Established a pattern to record all future code changes in this file for persistent context.
- **Drafts Management**: Enhanced the drafts route (`/drafts`) with improved media management capabilities.
- **Media UX**: Implemented a horizontal scrollable view for images and file attachments in the drafts modal, aligning it with the main workspace experience.
- **Header Actions**: Relocated media upload buttons to the modal header and removed redundant UI elements like image counts and footer upload buttons for a cleaner interface.
- **Persistence**: Updated draft saving and LinkedIn publishing logic to support both images and file attachments in the drafts library.
- **Legal Infrastructure**: Added dedicated `Privacy Policy` and `Terms of Service` pages to the landing page and footer to ensure transparency and compliance for LinkedIn OAuth and data handling.
- **Dynamic Pricing**: Updated the pricing page (`/pricing`) to dynamically reflect the user's current subscription status and admin privileges, highlighting active plans and granting full access to admin users.
