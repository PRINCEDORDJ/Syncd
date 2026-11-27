# AI provider configuration

The server supports OpenAI and Gemini through `POST /api/generate`. The browser
never receives provider credentials or calls either provider directly.

Set `AI_PROVIDER` to `openai` or `gemini`. If it is omitted, the server uses
OpenAI. Only the selected provider's API key is required.

```env
AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL=gpt-5.6
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-2.5-flash
```

The model variables are optional and have the defaults shown above. An
unsupported provider or missing selected-provider key returns a configuration
error and refunds the generation credit.

For local development, place these values in `.env`. For Cloudflare deployment,
configure the same names as encrypted Wrangler/Cloudflare Worker secrets or
runtime environment variables. Do not add them to `VITE_*` variables, client
bundles, committed files, or browser requests.

## Chat attachments

Files attached in the AI chat are separate from Canvas media. Canvas images and
files are publish-only and are **not** sent to the model; only Canvas text
(`currentDraft`) is included as context.

Chat attachments are sent with the user's message and validated server-side
before any credit is consumed:

- Up to 5 files per message (max 4 images), 10 MB per file, 15 MB total.
- Images: JPEG, PNG, GIF, WebP. Documents: `.pdf`, `.doc`, `.docx`, `.csv`,
  `.txt`, `.xls`, `.xlsx`, `.pptx`. `.ppt` is rejected (save it as `.pptx`).
- Documents are extracted to text (per file and per message caps) and the text
  is persisted on `chat_messages.attachments` so later turns can refer to the
  file without re-attaching it.
- Images are sent as vision input for the current turn. A compact OCR +
  description is persisted (best-effort) for later turns.

The actual attachment content is persisted too, so files survive a reload and
can be opened/downloaded later:

- `chat_messages.attachment_data` holds the full bytes as data URLs
  (`[{ id, name, mimeType, dataUrl }]`).
- `chat_messages.attachments` holds lightweight metadata, extracted text, and a
  small image thumbnail for rendering.
- Thread loads only select `attachments`; `attachment_data` is fetched lazily
  (RLS-scoped) when the user clicks an attachment, so transcripts stay light.
- Images are downscaled to at most 1600 px and re-encoded as JPEG (quality
  ~0.82) in the browser; thumbnails are at most 320 px. GIFs keep their original
  bytes so animation survives.

Scanned PDFs with no usable text layer are passed to the provider natively for
the current turn.

Image descriptions use Gemini when `GEMINI_API_KEY` is set, independent of
`AI_PROVIDER`. The model defaults to `gemini-2.5-flash`; override it with:

```env
GEMINI_VISION_MODEL=gemini-2.5-flash
```

If the key is missing or the description call fails/times out, the turn still
proceeds and the image is persisted with metadata only.
