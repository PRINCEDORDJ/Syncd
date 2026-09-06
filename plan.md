# Plan — Syncd (AI LinkedIn Posts, Scheduling & Team Workflows)

## Project Overview

**Syncd** is a modern, full-stack TanStack Start application designed for creators, professionals, and teams to streamline LinkedIn content creation. It combines AI-powered voice-matched draft generation (via OpenAI/Gemini), rich media attachments (images, videos, documents), minute-accurate scheduling, team collaboration workspaces, credit management, and native LinkedIn OAuth publishing.

### Key Technology Stack
- **Framework:** TanStack Start v1 (Vite + TanStack Router)
- **Database & Auth:** Supabase (PostgreSQL, Row Level Security, Realtime, Auth)
- **Billing & Subscriptions:** Polar integration for checkout and subscription portal
- **Deployment:** Cloudflare Workers / Vite SSR target
- **AI Integrations:** Google Gemini & OpenAI API support via server-side streaming API routes (`/api/generate`)

---

## Architecture & Core Modules

1. **Workspace & AI Studio (`/app`):**
   - Raw thought/bullet input with tone selection (*Authoritative & Warm, Conversational, Contrarian, Storytelling*).
   - Real-time SSE streaming generation (`/api/generate`) with credit consumption & refund handling.
   - Rich media management: Image carousel, document file attachments, and video uploads with validation and storage tracking.
   - Instant auto-saving drafts and one-click publishing to LinkedIn.

2. **Saved Posts Library (`/drafts`):**
   - Filterable view of drafts and published posts.
   - Modal viewer/editor for refining, re-attaching media, and scheduling.
   - Minute-accurate scheduling UI with background scheduler integration (`/api/public/scheduler`).

3. **Team Workspaces & Settings (`/settings`):**
   - Profile customization, avatar upload, and voice notes dictation.
   - LinkedIn OAuth integration & token expiry monitoring.
   - Subscription tier management (*Free*, *Studio*, *Teams*) via Polar checkout and customer portal.
   - Team member invitations and role management.

4. **Marketing & Public Pages (`/`, `/pricing`, `/methodology`, `/privacy`, `/terms`):**
   - High-conversion landing page with feature bento grid and interactive workspace preview.
   - Transparent pricing tiers and methodology documentation.

---

## Build Breakdown & Milestones

### Phase 1: Foundation & Core Infrastructure
- [x] **Project Scaffolding & Configuration:** TanStack Start setup with Vite, Tailwind CSS, TypeScript, and ESLint.
- [x] **Database Schema & Migrations:** Supabase tables (`profiles`, `drafts`, `subscriptions`, `teams`, `team_members`, `user_credits`, `credit_transactions`, `linkedin_connections`, `linkedin_oauth_states`, `user_storage`, `user_roles`).
- [x] **Authentication Integration:** Supabase Auth setup with custom session handlers and protected route gates (`/app`, `/drafts`, `/settings`).

### Phase 2: AI Generation & Media Pipeline
- [x] **Server-Side AI Generation (`/api/generate`):** Multi-provider support (OpenAI & Gemini) with secure API key handling, credit deduction (`consume_credit`), and streaming SSE response.
- [x] **Image & File Validation Engine:** Client-side batch validation for images (`MAX_IMAGES`), documents, and video attachments with byte-size tracking.
- [x] **Auto-save & Draft Management:** Real-time debounced database syncing for active workspace sessions.

### Phase 3: LinkedIn Integration & Publishing
- [x] **OAuth Connection Flow (`/api/linkedin/start`, `/api/linkedin/callback`, `/api/linkedin/disconnect`):** Secure state generation, authorization code exchange, token storage, and real-time connection status syncing.
- [x] **Native Publishing API (`/api/linkedin/publish`):** Direct publishing to LinkedIn feeds with support for text formatting, images, and document assets.
- [x] **Token Expiry & Error Handling:** Real-time alerts and automatic disconnection handling upon token expiration.

### Phase 4: Scheduling & Team Workspaces
- [x] **Minute-Accurate Scheduler (`/api/public/scheduler`):** Automated cron/background worker endpoint for publishing scheduled posts.
- [x] **Team Management & Collaboration:** Team creation, member invitations (`team_members`), role-based permissions (`owner`, `editor`, `viewer`), and shared draft access.
- [x] **Credit & Subscription Tiers (`/api/polar/*`):** Integration with Polar for checkout, customer portal, tier upgrades/downgrades, and monthly/daily credit resets.

### Phase 5: UI/UX Polishing, Marketing & Verification
- [x] **Marketing & Public Pages:** Landing page, interactive workspace preview (`WorkspacePreview`), pricing comparison, methodology, privacy, and terms pages.
- [x] **Loading Skeletons & Error Boundaries:** Polished skeleton screens for workspace, drafts, and settings to eliminate layout shifts.
- [x] **Production Build & Type-Checking Verification:** Validated Vite build, TypeScript compilation, and linting standards across all routes.
