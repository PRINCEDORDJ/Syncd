# Landing Page Refresh

Rewrite `src/routes/index.tsx` to showcase everything that shipped since the original landing page (teams, scheduling, credits, storage, multi-media publishing, dark mode). Keep the current typographic system, tokens, and `SiteNav` / `SiteFooter` / `WorkspacePreview` — this is a content and composition refresh, not a redesign.

## New page composition (top → bottom)

1. **Hero** — Sharper headline + subhead. Update the pill to reflect current state (e.g. "v1.2 · Teams, scheduling & credits"). Keep dual CTAs (workspace/login + methodology). Adjust proof line to mention "30 free credits every month · No credit card".
2. **Workspace preview** — Keep `<WorkspacePreview />` as-is.
3. **"Everything you need to ship on LinkedIn" — feature bento**
  A 6-tile bento grid (2×3 desktop, stacked mobile) with icons from `lucide-react`. Same visual language as existing bordered card grid:
  - **Generate in your voice** — AI drafts from raw input, tone controls
  - **Rich media posts** — Up to 4 images, 1 video, or PDF/Doc attachments
  - **Schedule anything** — Pick a date & time, cron worker publishes on the minute
  - **Team workspaces** — Invite up to 5 seats, share a draft library
  - **Credit-based, no surprises** — Monthly credits + daily cap on free, refunds on failed generations
  - **Direct LinkedIn publishing** — Official OAuth, formatting preserved, one click
4. **"Three steps. No fluff." — keep existing 3-step section** (Connect → Generate → Publish). Slightly refresh copy so step 3 mentions scheduling as an alternative to instant publish.
5. **Plans strip** — Compact 3-column pricing summary linking to `/settings` (billing tab) and `/pricing`:
  - Free — 30 credits / mo · 5 daily cap · 200 MB
  - Studio — 100 credits / mo · 5 GB · Scheduling
  - Teams — 350 credits / mo · 20 GB · 5 seats · Shared library
   Each card has a "See full pricing →" link to `/pricing`.
6. **Final CTA** — Keep existing centered CTA block, update copy to reference credits/scheduling.
7. **Footer** — unchanged.
8. Fix any security issues that are available

## SEO / head

Update the route `head()`:

- Title: `SocialSync — AI LinkedIn posts, scheduling & team drafts`
- Description: mention voice-matched AI drafts, scheduling, teams, one-click publishing (< 160 chars)
- og:title / og:description mirrored
- Keep `og:type: website`, add `twitter:card: summary_large_image`

## Constraints

- No new dependencies; use existing `lucide-react` icons and design tokens (`bg-card`, `border-border`, `text-ink`, `text-muted-foreground`, `bg-subtle`, `shadow-cta`, `font-mono`).
- No hardcoded colors; must look correct in dark mode (already themed via tokens).
- Mobile-first: bento grid stacks, plans strip stacks, hero text scales down.
- Only edits `src/routes/index.tsx`. No backend, no other route changes.

&nbsp;