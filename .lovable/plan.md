## 1. Destructive actions audit

Verify every delete/disconnect/sign-out path renders `ConfirmDialog`:

- `drafts.tsx` — card list Trash button (`remove()` → `setDeleteId`) and modal Delete → already wired to `ConfirmDialog`. ✓
- `settings.tsx` — Remove avatar, Disconnect LinkedIn, Sign out, Delete all data → already wired. ✓
- `SiteNav.tsx` — desktop + mobile sign out → already wired. ✓
- `app.tsx` — image/attachment `removeImage`/`removeAttachment` are lightweight editor state removals (staged, not persisted destructive ops); leave as-is (no confirm needed) but document decision.

No new code needed here beyond a quick pass; if any spot is found unwired during implementation, add `ConfirmDialog`.

## 2 + 4. Google sign in via Supabase (works on any domain)

- Add a "Continue with Google" button on `src/routes/login.tsx` (both signin & signup modes), above the email form with an "or" divider.
- Handler:
  ```ts
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/auth' },
  });
  ```
  No `lovable.auth` / `~oauth` proxy — works on Vercel/custom domains.
- Create `src/routes/auth.tsx` as a public callback route. It renders a "Signing you in…" state and relies on `AuthProvider`'s existing `onAuthStateChange` listener; when a session appears, `useEffect` navigates to `/app` (or a stored `redirect`). Falls through to `/login` if no session after ~4s.
- Enable the Google provider via `supabase--configure_social_auth({ providers: ["google"] })` so the flow works out of the box.

## 3. Settings page redesign

Restructure `src/routes/settings.tsx` into a tabbed layout while preserving all current logic (profile, voice notes, LinkedIn, billing, security, danger zone). Keep the current theme tokens (`ink`, `subtle`, `border`, mono uppercase labels, `shadow-soft`, rounded-xl cards).

Layout:

```
┌──────────────────────────────────────────┐
│ Settings header + subtitle               │
├──────────────────────────────────────────┤
│ [Profile] [Integrations] [Billing]       │  ← sticky tab strip
│ [Security] [Danger]                      │
├──────────────────────────────────────────┤
│  Active panel — card list                │
└──────────────────────────────────────────┘
```

- Tabs use `@/components/ui/tabs` (shadcn). Persist active tab in URL (`?tab=`) so LinkedIn/billing return links land correctly (auto-select `integrations` on `linkedin_*`, `billing` on `billing=success`).
- Profile tab: avatar block (larger, centered on mobile), display name, voice notes (with dictation button integrated inline as icon).
- Integrations tab: LinkedIn card only (extensible).
- Billing tab: current plan badge + limits summary + Manage/Upgrade buttons.
- Security tab: change password.
- Danger tab: sign out + delete data (both keep existing `ConfirmDialog`).
- Mobile: tabs scroll horizontally with `no-scrollbar`.

No behavior changes to any handler — only markup restructure.

## 6. Video upload in the editor

In `src/routes/app.tsx`:

- Add `videos: string[]` state (data URLs) alongside `images`, with limits `MAX_VIDEOS=1`, `MAX_VIDEO_SIZE=50MB`, accepted MIME `video/mp4, video/quicktime, video/webm`.
- Add `handleVideoFiles()` validator (new helper `validateVideoBatch` in `src/lib/image-validation.ts` or a new `src/lib/video-validation.ts` — new file to avoid overloading image module).
- Toolbar: new hidden `<input type="file" accept="video/*">` and a Film-icon button next to image/attach.
- Canvas preview: render an HTML5 `<video controls playsInline>` in the preview area when a video is present, with a remove overlay button (styled like existing image remove).
- Autosave: include `videos` in draft upsert (add `videos jsonb` column to `drafts` table via migration; default `[]`).
- Types regenerate after migration.
- Publish flow: LinkedIn video posting is a separate multipart upload API. Out of scope for this pass — video is saved on the draft and shown in the composer/preview; publishing continues to send text + images. Add a small hint under the video preview: "Video is saved to your draft. LinkedIn video publishing coming soon."
- Drafts modal (`drafts.tsx`): render the saved video read-only when present.

## Technical notes

- New route `src/routes/auth.tsx` (public, no auth guard, no `_authenticated` placement).
- Migration: `ALTER TABLE public.drafts ADD COLUMN videos jsonb NOT NULL DEFAULT '[]'::jsonb;`
- `supabase--configure_social_auth` enables Google provider (managed OAuth); on custom domains the direct `supabase.auth.signInWithOAuth` uses Supabase's own callback URL, independent of the Lovable `~oauth` proxy.
- Ensure the video upload follows the usage plan of the user.
- No changes to `src/integrations/supabase/*` generated files.

## Files touched

- `src/routes/login.tsx` — add Google button + divider
- `src/routes/auth.tsx` — new callback route
- `src/routes/settings.tsx` — redesigned with tabs
- `src/routes/app.tsx` — video picker + preview + state + autosave
- `src/routes/drafts.tsx` — render saved video in modal
- `src/lib/video-validation.ts` — new helper
- Migration adding `drafts.videos`
- Enable Google auth provider