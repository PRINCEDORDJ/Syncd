import type { AiFileInput, AiImageInput } from "@/lib/ai-provider.server";
import { describeImageForPersistence } from "@/lib/ai-provider.server";
import {
  ALLOWED_MESSAGE_DOCUMENT_EXTENSIONS,
  ALLOWED_MESSAGE_IMAGE_EXTENSIONS,
  ALLOWED_MESSAGE_IMAGE_TYPES,
  MAX_MESSAGE_ATTACHMENTS,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  MAX_MESSAGE_ATTACHMENT_TOTAL_BYTES,
  MAX_MESSAGE_IMAGES,
  type StoredAttachmentData,
  type StoredMessageAttachment,
} from "@/lib/attachments";

const MAX_DOCUMENT_CHARS_PER_FILE = 15_000;
const MAX_DOCUMENT_CHARS_TOTAL = 30_000;
const MAX_IMAGE_TEXT_CHARS = 2_000;
const MAX_THUMBNAIL_CHARS = 400_000; // ~300 KB decoded
const IMAGE_DESCRIBE_TIMEOUT_MS = 8_000;
const SCANNED_PDF_TEXT_THRESHOLD = 200;

export class ChatAttachmentError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ChatAttachmentError";
    this.status = status;
  }
}

export interface ParsedChatAttachments {
  /** Metadata + extracted text, persisted with the user's chat message. */
  stored: StoredMessageAttachment[];
  /** Full attachment bytes (data URLs), persisted separately and loaded lazily. */
  attachmentData: StoredAttachmentData[];
  /** Image attachments sent to the model as vision input for this turn. */
  imageInputs: AiImageInput[];
  /** Native PDF fallback for scanned documents with no usable text layer. */
  fileInputs: AiFileInput[];
  /** Extracted document text used in this turn's prompt. */
  documentTexts: { name: string; text: string }[];
}

function safeName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ChatAttachmentError("Invalid attachment payload.");
  }
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\\/]/g, "_").slice(0, 200);
}

/**
 * Client-supplied image thumbnails are only a rendering hint. Reject anything
 * that is not a small raster data URL; an invalid thumbnail is dropped rather
 * than failing the whole message.
 */
function safeThumbnail(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("data:image/")) return null;
  if (!/^data:image\/(jpeg|png|webp|gif);base64,/i.test(value)) return null;
  if (value.length > MAX_THUMBNAIL_CHARS) return null;
  return value;
}

function decodeDataUrl(dataUrl: unknown): { mimeType: string; base64: string; buffer: Buffer } {
  if (typeof dataUrl !== "string" || !dataUrl) {
    throw new ChatAttachmentError("Invalid attachment payload.");
  }

  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(dataUrl);
  if (!match) {
    throw new ChatAttachmentError("Invalid attachment data.");
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2].replace(/\s+/g, "");
  if (!base64) {
    throw new ChatAttachmentError("Invalid attachment data.");
  }

  // Quick guard before decoding a potentially huge payload.
  const maxBase64 = Math.ceil((MAX_MESSAGE_ATTACHMENT_BYTES * 4) / 3) + 1024;
  if (base64.length > maxBase64) {
    throw new ChatAttachmentError("One of the attached files is too large.");
  }

  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) {
    throw new ChatAttachmentError("One of the attached files is empty.");
  }
  if (buffer.length > MAX_MESSAGE_ATTACHMENT_BYTES) {
    throw new ChatAttachmentError("One of the attached files is too large.");
  }

  return { mimeType, base64, buffer };
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function capText(raw: string, max: number): { text: string; truncated: boolean } {
  const normalized = raw
    // eslint-disable-next-line no-control-regex
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (max <= 0) return { text: "", truncated: normalized.length > 0 };
  if (normalized.length <= max) return { text: normalized, truncated: false };
  return { text: `${normalized.slice(0, max).trimEnd()}\n\n[…truncated]`, truncated: true };
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { extractText } = await import("unpdf");
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
  return text;
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mod = (await import("mammoth")) as unknown as {
    extractRawText?: (input: { buffer: Buffer }) => Promise<{ value: string }>;
    default?: {
      extractRawText?: (input: { buffer: Buffer }) => Promise<{ value: string }>;
    };
  };
  const extractRawText = mod.extractRawText ?? mod.default?.extractRawText;
  if (!extractRawText) throw new Error("DOCX extractor unavailable.");
  const result = await extractRawText({ buffer });
  return result.value;
}

async function extractDocText(buffer: Buffer): Promise<string> {
  const mod = (await import("word-extractor")) as unknown as {
    default?: new () => { extract(input: Buffer): Promise<{ getBody(): string }> };
    WordExtractor?: new () => { extract(input: Buffer): Promise<{ getBody(): string }> };
  };
  const WordExtractor = mod.default ?? mod.WordExtractor;
  if (!WordExtractor) throw new Error("DOC extractor unavailable.");
  const doc = await new WordExtractor().extract(buffer);
  return doc.getBody();
}

async function extractSpreadsheetText(buffer: Buffer): Promise<string> {
  const mod = (await import("xlsx")) as typeof import("xlsx") & {
    default?: typeof import("xlsx");
  };
  const XLSX = mod.default ?? mod;
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const names: string[] = workbook.SheetNames;
  return names
    .map((name) => {
      const sheet = workbook.Sheets[name];
      if (!sheet) return "";
      return `## ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

async function extractPptxText(buffer: Buffer): Promise<string> {
  const mod = (await import("jszip")) as unknown as {
    default?: typeof import("jszip");
  };
  const JSZip = mod.default;
  if (!JSZip) throw new Error("PPTX extractor unavailable.");
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const an = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      const bn = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      return an - bn;
    });

  const slides: string[] = [];
  for (const name of slideNames) {
    const xml = await zip.files[name].async("string");
    const text = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
      .map((match) => decodeXmlEntities(match[1]))
      .join(" ")
      .trim();
    if (text) slides.push(text);
  }
  return slides.join("\n\n");
}

async function extractDocumentText(
  name: string,
  mimeType: string,
  buffer: Buffer,
): Promise<string> {
  const ext = extensionOf(name);
  if (ext === ".txt" || ext === ".csv" || mimeType === "text/plain" || mimeType === "text/csv") {
    return new TextDecoder().decode(buffer);
  }
  if (ext === ".pdf" || mimeType === "application/pdf") return extractPdfText(buffer);
  if (ext === ".docx") return extractDocxText(buffer);
  if (ext === ".doc") return extractDocText(buffer);
  if (ext === ".xlsx" || ext === ".xls") return extractSpreadsheetText(buffer);
  if (ext === ".pptx") return extractPptxText(buffer);
  throw new Error("Unsupported file type.");
}

function validateDocumentExtension(name: string): string {
  const ext = extensionOf(name);
  if (!(ALLOWED_MESSAGE_DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)) {
    if (ext === ".ppt") {
      throw new ChatAttachmentError(
        `".ppt" files aren't supported. Save "${name}" as .pptx and attach again.`,
      );
    }
    throw new ChatAttachmentError(`"${name}" — unsupported file type.`);
  }
  return ext;
}

function validateImageMime(name: string, mimeType: string): void {
  if (!(ALLOWED_MESSAGE_IMAGE_TYPES as readonly string[]).includes(mimeType)) {
    throw new ChatAttachmentError(
      `"${name}" uses an unsupported image format. Use JPEG, PNG, GIF, or WebP.`,
    );
  }
  const ext = extensionOf(name);
  if (ext && !(ALLOWED_MESSAGE_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new ChatAttachmentError(`"${name}" uses an unsupported image format.`);
  }
}

/**
 * Validates chat attachments, extracts document text, and creates a compact
 * text representation of images for later turns. Throws ChatAttachmentError
 * before any credit is consumed when the payload is invalid or unreadable.
 */
export async function parseChatAttachments(raw: unknown): Promise<ParsedChatAttachments> {
  if (raw === undefined || raw === null) {
    return { stored: [], attachmentData: [], imageInputs: [], fileInputs: [], documentTexts: [] };
  }
  if (!Array.isArray(raw)) {
    throw new ChatAttachmentError("Invalid attachment payload.");
  }
  if (raw.length > MAX_MESSAGE_ATTACHMENTS) {
    throw new ChatAttachmentError(
      `You can attach up to ${MAX_MESSAGE_ATTACHMENTS} files per message.`,
    );
  }

  const stored: StoredMessageAttachment[] = [];
  const attachmentData: StoredAttachmentData[] = [];
  const imageInputs: AiImageInput[] = [];
  const fileInputs: AiFileInput[] = [];
  const documentTexts: { name: string; text: string }[] = [];
  const imageJobs: { index: number; base64: string; mimeType: string }[] = [];

  let totalBytes = 0;
  let imageCount = 0;
  let remainingDocChars = MAX_DOCUMENT_CHARS_TOTAL;

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      throw new ChatAttachmentError("Invalid attachment payload.");
    }
    const {
      name: rawName,
      dataUrl,
      thumbnail,
    } = entry as {
      name?: unknown;
      dataUrl?: unknown;
      thumbnail?: unknown;
    };
    const name = safeName(rawName);
    const { mimeType, base64, buffer } = decodeDataUrl(dataUrl);
    const id = crypto.randomUUID();

    totalBytes += buffer.length;
    if (totalBytes > MAX_MESSAGE_ATTACHMENT_TOTAL_BYTES) {
      throw new ChatAttachmentError("The attached files exceed the 15 MB total limit.");
    }

    const isImage = mimeType.startsWith("image/");
    if (isImage) {
      validateImageMime(name, mimeType);
      imageCount += 1;
      if (imageCount > MAX_MESSAGE_IMAGES) {
        throw new ChatAttachmentError(
          `You can attach up to ${MAX_MESSAGE_IMAGES} images per message.`,
        );
      }
      stored.push({
        id,
        name,
        size: buffer.length,
        mimeType,
        kind: "image",
        text: null,
        thumbnail: safeThumbnail(thumbnail),
      });
      attachmentData.push({ id, name, mimeType, dataUrl: dataUrl as string });
      imageJobs.push({ index: stored.length - 1, base64, mimeType });
      imageInputs.push({ dataUrl: dataUrl as string, mimeType, base64 });
      continue;
    }

    const ext = validateDocumentExtension(name);
    let extracted: string;
    try {
      extracted = await extractDocumentText(name, mimeType, buffer);
    } catch (e) {
      console.error(`[generate] attachment extraction failed for ${ext}`, e);
      throw new ChatAttachmentError(
        `We couldn't read "${name}". Try another file or save it as PDF, DOCX, TXT, or CSV.`,
        422,
      );
    }

    const capped = capText(
      extracted,
      Math.max(0, Math.min(MAX_DOCUMENT_CHARS_PER_FILE, remainingDocChars)),
    );
    remainingDocChars -= capped.text.length;

    stored.push({
      id,
      name,
      size: buffer.length,
      mimeType,
      kind: "document",
      text: capped.text,
      truncated: capped.truncated,
    });
    attachmentData.push({ id, name, mimeType, dataUrl: dataUrl as string });
    documentTexts.push({ name, text: capped.text });

    // A PDF with no usable text layer is probably scanned. Send the actual PDF
    // for this turn so the provider can read it visually; the persisted entry
    // keeps the (empty) extracted text for future turns.
    if (
      (ext === ".pdf" || mimeType === "application/pdf") &&
      extracted.trim().length < SCANNED_PDF_TEXT_THRESHOLD
    ) {
      fileInputs.push({
        dataUrl: dataUrl as string,
        mimeType: "application/pdf",
        base64,
        filename: name,
      });
    }
  }

  // Best-effort OCR + description for images; the current turn still gets the
  // image itself, this is only persisted for later turns.
  const imageTexts = await Promise.all(
    imageJobs.map((job) =>
      withTimeout(
        describeImageForPersistence({ base64: job.base64, mimeType: job.mimeType }),
        IMAGE_DESCRIBE_TIMEOUT_MS,
        null,
      ),
    ),
  );
  imageTexts.forEach((text, i) => {
    const job = imageJobs[i];
    if (!job) return;
    const entry = stored[job.index];
    if (!entry || !text) return;
    const capped = capText(text, MAX_IMAGE_TEXT_CHARS);
    entry.text = capped.text;
    entry.truncated = capped.truncated;
  });

  return { stored, attachmentData, imageInputs, fileInputs, documentTexts };
}
