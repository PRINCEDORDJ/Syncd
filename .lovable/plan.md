---

**Goal** Rework the workspace upload UX to be Reddit-style: compact upload actions live in the header next to the title/tone, uploaded **images** render full-width inside the canvas with horizontal scroll for multiples, and uploaded **non-image files** (PDFs, DOCX, CSV, etc.) render as a compact attachment strip below the image carousel.

---

**Changes (all in** `src/routes/app.tsx`**)**

---

**1. Header row — two upload buttons alongside title + tone**

- In the workspace card header (the row containing `BrandMark / title input / Saving… / Tone chips`), add **two** small icon buttons on the right side, grouped together after the tone selector:
  - **"Add image"** — icon `ImagePlus`, wired to an `<input type="file" accept="image/*">` ref.
  - **"Add file"** — icon `Paperclip`, wired to a **new** hidden `<input type="file" accept=".pdf,.doc,.docx,.csv,.txt,.xls,.xlsx,.pptx">` ref (`fileAttachInputRef`).
- Keep existing `handleFiles` / `MAX_IMAGES` validation logic for images unchanged.
- Add parallel state + validation for non-image attachments:
  - New state: `attachments` — array of `{ name: string; size: number; type: string; dataUrl: string }`.
  - New constant: `MAX_ATTACHMENTS = 5` (or whatever the product limit is).
  - New handler: `handleAttachments` — validates count, enforces `MAX_FILE_SIZE` (e.g. 10 MB per file), pushes into `attachments` state.
- Disable **"Add image"** when `images.length >= MAX_IMAGES`.
- Disable **"Add file"** when `attachments.length >= MAX_ATTACHMENTS`.
- Mobile: both buttons remain visible in the same horizontally-scrollable strip as the tone chips.

---

**2. Canvas — Reddit-style inline image carousel (unchanged from original)**

- Remove the current "Images" section (label, count chip, dashed "Add images" button, 4-column grid) from the Canvas section.
- Directly above the draft `<textarea>`, render uploaded images inline only when `images.length > 0`:
  - **Single image:** full-width, natural aspect ratio (`w-full h-auto max-h-[480px] object-contain`), rounded with subtle border.
  - **Multiple images:** horizontal scroll container (`flex overflow-x-auto snap-x`), each item `w-full shrink-0 snap-center max-h-[480px] object-contain`. Users swipe/scroll to move between them.
  - Small dot/position indicator under the strip (e.g. `2 / 4`) — purely positional, not an upload count.
  - Hover-reveal `X` remove button on each image (existing `removeImage` logic).
- Remove the `images.length / MAX_IMAGES` counter and byte-size readout from this section entirely.

---

**3. Canvas — file attachment strip (new)**

- **Directly below the image carousel** (or directly above the `<textarea>` if no images exist), render an attachment strip only when `attachments.length > 0`.
- Each attachment renders as a **pill/row** containing:
  - A file-type icon on the left — map `type` → icon:
    - PDF → `FileText`
    - DOCX / DOC → `FileType` (or `FileText`)
    - CSV / XLS / XLSX → `Sheet` (or `Table`)
    - PPT / PPTX → `Presentation`
    - TXT → `FileText`
    - Fallback → `File`
  - **Filename** (truncated with ellipsis if > ~30 chars, full name in `title` tooltip).
  - **File size** formatted with `formatBytes` (reuse existing util).
  - A hover-reveal `X` button that calls `removeAttachment(index)`.
- Layout: `flex flex-col gap-1.5` — stacked vertically, each pill full-width of the canvas column with a subtle background (`bg-muted/40`) and border, matching the canvas card aesthetic.
- Do **not** show a byte-size total or attachment count — individual sizes per pill are sufficient.

---

**4. Unpublished drafts — show uploads**

- In the draft list / draft preview (wherever drafts that have not been published are surfaced):
  - If a draft has `images.length > 0`, show a **small thumbnail strip** — same horizontal-scroll pattern but with `max-h-[120px]` thumbnails.
  - If a draft has `attachments.length > 0`, show a **compact pill list** of filenames + sizes, identical in structure to the canvas strip but at smaller scale.
  - Both should appear between the draft title/tone meta and the draft body preview text.
  - Published drafts: no change.

---

**5. Cleanup**

- Drop `formatBytes` / `dataUrlByteSize` imports **only** if no longer referenced anywhere (both are still needed — `formatBytes` is now used in the attachment pill, `dataUrlByteSize` is still used in `validateImageBatch`). Keep both.
- Keep `validateImageBatch` + error surfacing untouched — image errors still appear in the existing error banner below the canvas.
- Add a parallel `validateAttachmentBatch` function that checks count limit and per-file size, surfacing errors through the **same** error banner mechanism.
- Keep all existing state, refs, and validation rules for images 100% intact.

---

**Out of scope**

- No backend, schema, or save-logic changes.
- No changes to image validation rules, max image count, or image persistence.
- No nav / settings / other routes touched.

---

**Visual reference (ASCII)**

```
┌─ Header ──────────────────────────────────────────────────────┐
│ ◆ /  My draft title       [Tone chips…]  [📎 File] [🖼 Image] │
├───────────────────────────────────────────────────────────────┤
│ Raw input  │  Canvas                                          │
│            │  ┌──────────────────────────────────────────┐   │
│            │  │  [ image 1 full-width ]  →  scroll →     │   │
│            │  └──────────────────────────────────────────┘   │
│            │              • ◦ ◦                               │
│            │  ┌──────────────────────────────────────────┐   │
│            │  │ 📄 report.pdf          12 KB          [x]│   │
│            │  │ 📊 data.csv             4 KB          [x]│   │
│            │  └──────────────────────────────────────────┘   │
│            │  [ draft textarea …                          ]   │
└───────────────────────────────────────────────────────────────┘

Draft list (unpublished only):
┌─────────────────────────────────────────┐
│ My draft title          Casual  2h ago  │
│ [thumb1][thumb2]                        │
│ 📄 report.pdf  12 KB  │ 📊 data.csv 4KB │
│ Preview text of the draft body…         │
└─────────────────────────────────────────┘

```

---

**Key additions over the original prompt:**

- `fileAttachInputRef` + `attachments` state + `handleAttachments` + `validateAttachmentBatch` + `removeAttachment`
- File-type icon mapping
- Attachment pill strip in canvas
- Both image thumbnails and attachment pills surfaced in unpublished draft list view  
  
The draft textarea should come before the image and or file upload and also enforce the limits on the user's plan except Admin who has access to features