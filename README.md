# Syncd — AI LinkedIn Posts, Scheduling & Team Workflows

**Syncd** is a modern, full-stack TanStack Start application designed for creators, professionals, and teams to streamline LinkedIn content creation. It combines AI-powered voice-matched draft generation (via OpenAI/Gemini), rich media attachments (images, videos, documents), minute-accurate scheduling, team collaboration workspaces, credit management, and native LinkedIn OAuth publishing.

---

## 🚀 Key Features

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

## 🛠️ Technology Stack

- **Framework:** [TanStack Start v1](https://tanstack.com/router/v1) (Vite + TanStack Router)
- **Database & Auth:** [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security, Realtime, Auth)
- **Billing & Subscriptions:** [Polar](https://polar.sh/) integration for checkout and subscription portal
- **Deployment Target:** [Cloudflare Workers](https://workers.cloudflare.com/) / Vite SSR target
- **AI Integrations:** Google Gemini & OpenAI API support via server-side streaming API routes (`/api/generate`)

---

## 📦 Getting Started

### Prerequisites

Ensure you have Node.js and Bun/npm installed.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/PRINCEDORDJ/Syncd.git
   cd ssyncd
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Copy `.env.example` to `.env` and fill in the required Supabase and AI keys:
   ```bash
   cp .env.example .env
   ```

### Development

Start the development server:
```bash
npm run dev
```

The application will be running at `http://localhost:3000` (or the configured Vite port).

### Production Build & Verification

To compile TypeScript and build the project for production:
```bash
npm run build
```

To run formatting and linting:
```bash
npm run format
npm run lint
```
