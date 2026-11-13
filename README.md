<p align="center">
  <img src="src/assets/brand-icon.png" alt="Syncd logo" width="96" height="96" />
</p>

<h1 align="center">Syncd</h1>

<p align="center">
  <strong>AI LinkedIn posts, scheduling &amp; team workflows</strong><br/>
  A full-stack TanStack Start application for creators, professionals, and teams to streamline LinkedIn content creation — AI voice-matched draft generation, rich media attachments, minute-accurate scheduling, team workspaces, credit management, and native LinkedIn OAuth publishing.
</p>

---

## ✨ Key Features

### Workspace & AI Studio (`/app`)

- Dump raw thoughts, bullets, images, documents, or **voice notes** and get a streamed LinkedIn draft.
- Tone selection (_Authoritative & Warm, Conversational, Contrarian, Storytelling_).
- **AI Sidechat** with two modes:
  - _Ask_ — assistant chat that leaves the canvas untouched.
  - _Post_ — generate and refine the draft directly on the canvas.
- **Voice input in chat** — record a voice note from the input bar; it is transcribed server-side with Gemini and dropped into the input for review before sending.
- Real-time SSE streaming generation (`/api/generate`) with credit consumption & automatic refund handling.
- Rich media management: image carousel, document attachments, and video uploads with validation and storage tracking.
- Instant auto-saving drafts and one-click publishing to LinkedIn.

### Saved Posts Library (`/drafts`)

- Filterable view of drafts and published posts.
- Modal viewer/editor for refining, re-attaching media, and scheduling.
- Minute-accurate scheduling UI backed by the scheduler endpoint (`/api/public/scheduler`).

### Schedule & Notifications (`/schedule`, `/notifications`)

- Scheduled posts overview and in-app notifications.

### Team Workspaces & Settings (`/settings`)

- Profile customization, avatar upload, and voice notes dictation (Web Speech API).
- **Voice calibration** (Studio & Teams) — paste past posts and Syncd builds a structured writing-voice profile the generator matches (`/api/voice/calibrate`).
- LinkedIn OAuth integration & token expiry monitoring.
- Subscription tier management (_Free_, _Studio_, _Teams_) via Polar checkout and customer portal.
- Team member invitations (email via Resend) and role management.

### Marketing & Public Pages (`/`, `/pricing`, `/methodology`, `/privacy`, `/terms`)

- Landing page with feature bento grid and interactive workspace preview.
- Transparent pricing tiers and methodology documentation.

---

## 🛠️ Technology Stack

| Area                    | Technology                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Framework               | [TanStack Start v1](https://tanstack.com/start) (Vite 7 + TanStack Router, React 19, SSR file routes)                |
| Styling                 | [Tailwind CSS v4](https://tailwindcss.com/) + shadcn-style UI (Radix primitives)                                     |
| Database & Auth         | [Supabase](https://supabase.com/) — PostgreSQL, Row Level Security, Realtime, Auth, Storage                          |
| Billing & Subscriptions | [Polar](https://polar.sh/) — checkout, customer portal, webhooks                                                     |
| Email                   | [Resend](https://resend.com/) — workspace invite emails                                                              |
| AI Generation           | OpenAI-compatible streaming ([AI SDK](https://sdk.vercel.ai/)) or Google Gemini, routed server-side by `AI_PROVIDER` |
| Voice Transcription     | Google Gemini (`/api/transcribe`, always Gemini regardless of `AI_PROVIDER`)                                         |
| Deployment Target       | [Cloudflare Workers](https://workers.cloudflare.com/) via `@cloudflare/vite-plugin` (`wrangler.jsonc`)               |

---

## 📡 API Endpoints

| Endpoint                                                           | Purpose                                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `POST /api/generate`                                               | Streaming AI generation (assistant chat & post generator), credit-aware, SSE response |
| `POST /api/transcribe`                                             | Voice-note transcription with Gemini (authenticated, base64 audio)                    |
| `POST /api/voice/calibrate`                                        | Writing-voice profile calibration (Studio & Teams, consumes a credit)                 |
| `POST /api/linkedin/start` / `callback` / `publish` / `disconnect` | LinkedIn OAuth & publishing                                                           |
| `POST /api/polar/checkout` / `portal`                              | Polar subscription checkout & customer portal                                         |
| `POST /api/public/polar/webhook`                                   | Polar billing webhooks                                                                |
| `POST /api/public/scheduler`                                       | Publishing scheduler tick (guarded by a shared `apikey` header; triggered externally) |
| `POST /api/workspace/invite`                                       | Team member invitations                                                               |

---

## 📦 Getting Started

### Prerequisites

- **Node.js 20.19+ or 22.12+** (required by Vite 7)
- npm (or Bun/pnpm)

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

3. Set up environment variables — copy `.env.example` to `.env` and fill in the required keys:

   ```bash
   cp .env.example .env
   ```

   The main groups (see `.env.example` for the full list):

   | Group         | Variables                                                                                                                                             |
   | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
   | AI generation | `AI_PROVIDER` (`openai` \| `gemini`), `OPENAI_API_KEY`/`OPENAI_MODEL`/`OPENAI_BASE_URL` or `GEMINI_API_KEY`/`GEMINI_MODEL`, `GEMINI_TRANSCRIBE_MODEL` |
   | Supabase      | `VITE_SUPABASE_*` for the client; `SUPABASE_*` or `APP_SUPABASE_*` for the server (on hosts that inject their own `SUPABASE_*`, set `APP_SUPABASE_*`) |
   | Billing       | `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, product IDs                                                                                             |
   | Email         | `RESEND_API_KEY`, `RESEND_FROM`                                                                                                                       |
   | LinkedIn      | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`                                                                                                        |

### Development

Start the development server:

```bash
npm run dev
```

Vite prints the local URL in the terminal (e.g. `http://localhost:5173`).

### Production Build & Verification

```bash
npm run build   # type-aware production build (Cloudflare Workers target)
npm run format  # prettier
npm run lint    # eslint
```

---

## 🗂️ Project Structure

```
src/
├── routes/            # TanStack file routes — pages (app, drafts, settings…) and
│                      #   API endpoints (api.generate, api.transcribe, …)
├── components/        # UI (workspace, settings, marketing, shadcn-style ui/)
├── lib/               # Client logic (workspace context, AI provider config, hooks)
├── integrations/      # Supabase client & generated database types
├── assets/            # Brand assets (logo used above)
public/                # Static assets (favicon)
wrangler.jsonc         # Cloudflare Workers deployment config
```
