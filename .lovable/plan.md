## Goal

Bring the drafts library modal to feature parity with the workspace: let users add and remove images on saved drafts using the same validation rules already enforced in `src/routes/app.tsx`, and surface validation feedback consistently in both places. Keep the existing minimal black/ink + subtle/border theme — no new colors or component libraries.

## Scope

1. **`src/routes/drafts.tsx`** — add image management inside the preview modal.
2. **`src/routes/app.tsx`** — small polish so validation errors render the same way drafts will, and the image counter shows total size used.
3. Reuse the existing `src/lib/image-validation.ts` helpers (`MAX_IMAGES`, `validateImageBatch`, `dataUrlByteSize`, `formatBytes`). No new files, no schema changes (the `drafts.images` `text[]` column already exists).

## Drafts modal changes (`src/routes/drafts.tsx`)

Inside the modal body (where attached images are currently read-only):

- Replace the static "Attached images (n)" grid with an editable grid:
  - Each thumbnail keeps the current `aspect-square rounded-md border border-border` styling and gains a hover-revealed remove button (same `bg-ink/80 text-surface` circular `X` button used in `app.tsx`).
  - Below the grid, add a dashed "Add images" button matching the workspace one (`border-dashed border-border`, `ImagePlus` icon, hover `border-ink/40 hover:bg-card`). Disabled when `MAX_IMAGES` is reached.
  - Show counter `n / MAX_IMAGES · formatBytes(totalBytes)` in the same `text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground` style used elsewhere.
- Add local modal state: `modalImages: string[]`, `modalError: string | null`, `savingImages: boolean`, `dirty: boolean` (true when `modalImages` differs from `selected.images`).
  - Initialize from `selected.images` whenever `selected` changes (effect keyed on `selected?.id`).
- Add `handleModalFiles(files)` that mirrors `app.tsx`:
  - Compute `existingBytes` via `dataUrlByteSize`.
  - Call `validateImageBatch(Array.from(files), modalImages.length, existingBytes)`.
  - Surface joined errors in `modalError`; FileReader-decode accepted files; append, capped at `MAX_IMAGES`.
- Add `removeModalImage(idx)` that splices and marks dirty.
- Persist on demand: a `Save changes` button (visible only when `dirty`) calls
  ```ts
  supabase.from("drafts")
    .update({ images: modalImages })
    .eq("id", selected.id)
    .eq("user_id", user.id)
  ```
  On success, update the local `rows` list and `selected` so the row preview and modal reflect the change. Show errors via `modalError`. RLS is already in place for owner-only updates.
- Publish flow (`publishDraft`) must use `modalImages` instead of `row.images` so unsaved attachments still ride with the post (the function will also auto-save the new images alongside marking `published: true`, in a single `update` call).
- When the modal closes (`setSelected(null)`), reset `modalImages`, `modalError`, `dirty`.

Layout/theme rules preserved:
- All buttons use existing classes (`h-9 px-4 rounded-md text-[13px] font-medium`, `bg-ink text-surface`, `border border-border bg-card`, etc.).
- Error block reuses the existing `bg-destructive/5 border-destructive/20 text-destructive` style.
- Save indicator uses the same dot pattern as the workspace success state (`size-1.5 rounded-full bg-ink`).

## Workspace polish (`src/routes/app.tsx`)

Small, non-breaking improvements:

- In the Images header, append the formatted total size next to the count: `n / MAX_IMAGES · formatBytes(totalBytes)` using `dataUrlByteSize`. Same typography as today.
- No other behavior changes (validation lib already wired in).

## Technical notes

- `image-validation.ts` already enforces: ≤ `MAX_IMAGES` (4), per-file ≤ 5 MB, total ≤ 15 MB, allowed mime types JPEG/PNG/GIF/WebP. We reuse it verbatim — no duplication.
- Drafts list query already selects `images`, and the modal type already includes `images: string[]`. No type or query changes needed.
- Auto-save in the workspace is unchanged; drafts modal uses an explicit Save action to avoid surprising writes while the user is browsing.
- No DB migration. RLS policies on `drafts` already cover update by owner.
- No new dependencies, icons reused: `ImagePlus`, `X`, `Send`, `Trash2`.

## Out of scope

- Editing draft `content` / `tone` / `title` from the modal.
- Uploading to storage buckets — images stay as base64 data URLs in the `images` column, matching current behavior.
- Bulk actions or drag-and-drop reordering.
