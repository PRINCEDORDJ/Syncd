# Syncd — Workspace Redesign

**Date:** 2026-09-08
**Stack:** React, TanStack Start, Tailwind CSS, shadcn/ui, Supabase, Cloudflare Workers

## Goal
Replace the current top-navbar + two-panel layout with a persistent workspace shell:
left sidebar (nav + drafts + workspace switcher), center canvas (the editable post),
right AI sidechat (hybrid generate-then-refine chat). Fully responsive down to mobile,
where the layout collapses to a tab switcher with a persistent bottom input bar.

## Visual language (kept from current app)
- Near-black background (`#0A0A0A` base, `#111214` panel), thin `1px` hairline borders
  (`rgba(255,255,255,0.08)`), cyan/teal accent for active states and gradient headline text.
- Small tracked-out uppercase micro-labels (`TONE`, `RAW INPUT`, `CANVAS`) — keep these,
  they're already the app's identity, don't swap in a new type system.
- One accent color used sparingly (cyan), not decorated further.

## Layout: desktop (≥1024px)
```
┌───────────┬─────────────────────────────┬──────────────────┐
│  Sidebar  │           Canvas            │   AI Sidechat     │
│  240px    │           flex-1            │   380px           │
│ (collaps- │  editable post, tone pills,  │  hybrid chat:     │
│  ible→64) │  word count, Copy/Publish    │  turn 1 = raw     │
│           │                              │  input → canvas;  │
│  nav      │                              │  turn 2+ = refine │
│  drafts   │                              │  instructions      │
│  switcher │                              │                    │
└───────────┴─────────────────────────────┴──────────────────┘
```
- Sidebar collapses to icon rail (64px), pinned via a toggle at its top.
- Sidechat is collapsible too, so power users can go full-width Canvas.

## Layout: mobile (<768px)
```
┌─────────────────────────────┐
│  ☰   Untitled draft   [Tone▾]│  ← compact header
├─────────────────────────────┤
│  [ Canvas ] [ Chat ]          │  ← swipeable tabs
│                                │
│         (active tab)          │
│                                │
├─────────────────────────────┤
│  📎  Message Syncd…      ➤   │  ← persistent input, both tabs
└─────────────────────────────┘
```
- Sidebar becomes a full-screen slide-over drawer from the hamburger.
- `ChatInputBar` is one shared component, rendered inline in the desktop sidechat
  and pinned to the bottom on mobile — never duplicated.
- Sending a message from the Canvas tab auto-switches to Chat only if the reply
  is conversational text; pure canvas updates (regenerate/refine) keep you on Canvas.

## Chat behavior (hybrid mode)
Single thread per draft:
1. **First turn** — raw dump (thought, bullets, voice transcript) → streams into Canvas,
   chat logs a short system line ("Generated a first draft").
2. **Subsequent turns** — natural-language edits ("make it punchier", "cut paragraph 2")
   → Canvas updates in place (diff-style, not full replace where possible), chat shows
   a one-line assistant summary of what changed, not the whole post again.
3. Manual edits made directly in the Canvas are the source of truth; the next chat
   instruction is applied on top of the current Canvas text, not the last AI output.

## Components
- `AppShell` — responsive switch between 3-column desktop and drawer+tabs mobile.
- `Sidebar` / `NavLinks` / `DraftList` / `WorkspaceSwitcher`
- `Canvas` — editable post body, tone pills, word/char counter, Copy/Publish actions.
- `AiChatPanel` — message list + mounts shared `ChatInputBar`.
- `ChatInputBar` — used both inline (desktop) and pinned (mobile).
- `MobileTabs` — Canvas/Chat swipeable switcher, mobile only.

## Open items for implementation
- Streaming: Canvas updates should stream token-by-token on generation for perceived speed.
- Diffing strategy for "refine" turns (full replace vs. targeted patch) — worth prototyping
  both; targeted patch is nicer but riskier to get right with an LLM.
- Persisting sidebar collapsed/expanded state and last-active tab per user (localStorage
  or a `ui_state` Supabase row).
