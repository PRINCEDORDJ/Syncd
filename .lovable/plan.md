## Goal

Make the avatar in the profile profile tab interactive to view , change or upload a picture

Frontend only. Reuses the existing `avatars` storage bucket and `profiles.avatar_url` column. No schema or backend changes.

## Changes

### 1. `src/router/settings.tsx` — avatar interaction

- Replace the current "Avatar = single dropdown trigger" with a **two-trigger pattern**:
  - **Click the avatar image itself** → opens a new lightweight "Avatar actions" popover (Radix Popover) with:
    - **View photo** (only if `avatarUrl` set) — opens a Dialog showing the image full-size on a dark backdrop, with filename-free close button
    - **Upload photo** / **Change photo** — triggers a hidden `<input type="file" accept="image/*">`
    - **Remove photo** (only if `avatarUrl` set) — destructive style
  - **Click a small chevron / caret** next to the avatar → opens the existing account dropdown (Workspace, Posts, Settings, Sign out). Keeps the current account-menu functionality.
- Show an **upload spinner overlay** on the avatar while uploading (semi-transparent ring + Loader2 icon).
- After upload/remove succeeds, update local `avatarUrl` state immediately so the navbar reflects the change without a refresh.
- Toast feedback via `sonner` for success/error (already used in project).

### 2. New helper `src/lib/avatar-upload.ts`

- Extract the avatar upload + remove logic currently duplicated in `settings.tsx` into a shared async helper:
  - `uploadAvatar(userId, file): Promise<{ url: string }>` — validates type/size (image/*, ≤5MB), uploads to `avatars/{userId}/avatar-{ts}.{ext}`, upserts `profiles.avatar_url`, returns public URL.
  - `removeAvatar(userId): Promise<void>` — sets `profiles.avatar_url` to null.
- `src/routes/settings.tsx` is refactored to call this helper (keeps existing settings UI intact, no behavior change there).

### 3. Image loading polish

- Add `loading="lazy"` and a subtle fade-in (`transition-opacity` + `onLoad` to flip opacity from 0 → 100) on the navbar avatar image so swapped photos don't flash.
- Full-size view dialog: `object-contain max-h-[80vh] max-w-[90vw]`, dark backdrop, close on Escape / backdrop click (Radix Dialog defaults).

## Out of scope

- Avatar cropping / resizing UI
- Removing or redesigning the existing Settings → Profile photo section (still fully usable; just refactored to share the helper)
- Any change to drafts, billing, auth, or routing

## Technical notes

- Use existing shadcn `Popover` and `Dialog` components (already in `src/components/ui/`).
- Hidden file input lives inside the popover content; popover closes on selection, then upload runs.
- File size guard mirrors the current 5MB rule in `settings.tsx`.
- No new packages.