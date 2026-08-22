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
