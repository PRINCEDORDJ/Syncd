import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

export type AiImageInput = {
  dataUrl: string;
  mimeType: string;
  base64: string;
};

export type AiGenerationInput = {
  systemPrompt: string;
  userPrompt: string;
  images: AiImageInput[];
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

function getProviderConfig(): { provider: AiProvider; model: string; apiKey: string } {
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
      (provider === "openai" ? "gpt-5.6" : "gemini-2.5-flash"),
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
  config: { apiKey: string; model: string },
  input: AiGenerationInput,
): Promise<AsyncIterable<string>> {
  const client = new OpenAI({ apiKey: config.apiKey });
  const content = [
    { type: "input_text", text: input.userPrompt },
    ...input.images.map((image) => ({
      type: "input_image",
      image_url: image.dataUrl,
      detail: "auto",
    })),
  ];
  const stream = await client.responses.create({
    model: config.model,
    instructions: input.systemPrompt,
    input: [{ role: "user", content }],
    stream: true,
  });

  return (async function* () {
    for await (const event of stream) {
      if (event.type === "response.output_text.delta" && event.delta) yield event.delta;
    }
  })();
}

async function createGeminiStream(
  config: { apiKey: string; model: string },
  input: AiGenerationInput,
): Promise<AsyncIterable<string>> {
  const client = new GoogleGenAI({ apiKey: config.apiKey });
  const stream = await client.models.generateContentStream({
    model: config.model,
    contents: [{ role: "user", parts: toGeminiParts(input) }],
    config: { systemInstruction: input.systemPrompt },
  });

  return (async function* () {
    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text;
    }
  })();
}

export async function createAiTextStream(
  input: AiGenerationInput,
): Promise<AsyncIterable<string>> {
  const config = getProviderConfig();
  return config.provider === "openai"
    ? createOpenAiStream(config, input)
    : createGeminiStream(config, input);
}

