import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";
import { GoogleGenAI } from "@google/genai";

export type AiImageInput = {
  dataUrl: string;
  mimeType: string;
  base64: string;
};

export type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiGenerationInput = {
  systemPrompt: string;
  userPrompt: string;
  images: AiImageInput[];
  /** Prior turns of the conversation (text-only), oldest first. */
  history?: AiChatMessage[];
};

export type AiProvider = "openai" | "gemini";

export class AiConfigurationError extends Error {
  readonly code = "AI_CONFIGURATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function getProviderConfig(): {
  provider: AiProvider;
  model: string;
  apiKey: string;
  baseURL?: string;
  providerName?: string;
} {
  const provider = (readEnv("AI_PROVIDER") ?? "openai").toLowerCase();
  if (provider !== "openai" && provider !== "gemini") {
    throw new AiConfigurationError(
      `Unsupported AI_PROVIDER. Expected "openai" or "gemini", received "${provider}".`,
    );
  }

  const apiKey = readEnv(provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY");
  if (!apiKey) {
    throw new AiConfigurationError(
      `AI is not configured for ${provider}. Set ${provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"}.`,
    );
  }

  return {
    provider,
    apiKey,
    model:
      readEnv(provider === "openai" ? "OPENAI_MODEL" : "GEMINI_MODEL") ??
      (provider === "openai" ? "qwen/qwen3.8-max:free" : "gemini-2.5-flash"),
    ...(provider === "openai"
      ? {
          baseURL: readEnv("OPENAI_BASE_URL") ?? "https://api.xkiro.com/v1",
          providerName: readEnv("OPENAI_PROVIDER_NAME") ?? "openai-compatible",
        }
      : {}),
  };
}

function toGeminiParts(input: AiGenerationInput) {
  return [
    { text: input.userPrompt },
    ...input.images.map((image) => ({
      inlineData: { data: image.base64, mimeType: image.mimeType },
    })),
  ];
}

async function createOpenAiStream(
  config: {
    apiKey: string;
    model: string;
    baseURL?: string;
    providerName?: string;
  },
  input: AiGenerationInput,
): Promise<AsyncIterable<string>> {
  const content = [
    { type: "text" as const, text: input.userPrompt },
    ...input.images.map((image) => ({
      type: "image" as const,
      image: image.dataUrl,
    })),
  ];
  const provider = createOpenAICompatible({
    baseURL: config.baseURL ?? "https://api.xkiro.com/v1",
    name: config.providerName ?? "openai-compatible",
    apiKey: config.apiKey,
  });
  const historyMessages = (input.history ?? []).map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const stream = streamText({
    model: provider.chatModel(config.model),
    system: input.systemPrompt,
    messages: [...historyMessages, { role: "user", content }],
  });

  return stream.textStream;
}

async function createGeminiStream(
  config: { apiKey: string; model: string },
  input: AiGenerationInput,
): Promise<AsyncIterable<string>> {
  const client = new GoogleGenAI({ apiKey: config.apiKey });
  const historyContents = (input.history ?? []).map((message) => ({
    role: message.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: message.content }],
  }));
  const stream = await client.models.generateContentStream({
    model: config.model,
    contents: [...historyContents, { role: "user" as const, parts: toGeminiParts(input) }],
    config: { systemInstruction: input.systemPrompt },
  });

  return (async function* () {
    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text;
    }
  })();
}

export async function createAiTextStream(input: AiGenerationInput): Promise<AsyncIterable<string>> {
  const config = getProviderConfig();
  return config.provider === "openai"
    ? createOpenAiStream(config, input)
    : createGeminiStream(config, input);
}

/** Single non-streaming completion, aggregated from the shared provider router. */
export async function generateAiText(input: AiGenerationInput): Promise<string> {
  let result = "";
  for await (const chunk of await createAiTextStream(input)) {
    result += chunk;
  }
  return result;
}
