import { formatBytes } from "@/lib/image-validation";

/**
 * Chat message attachments are deliberately separate from Canvas media.
 * Canvas images/files keep using `images` / `attachments` in workspace state and
 * the drafts table; these types describe only files attached to a chat message.
 */

export type MessageAttachmentKind = "image" | "document";

export interface MessageAttachmentMeta {
  name: string;
  size: number;
  mimeType: string;
  kind: MessageAttachmentKind;
}

/** A composer attachment while it is waiting to be sent. */
export interface MessageAttachment extends MessageAttachmentMeta {
  id: string;
  dataUrl: string;
}

/** Metadata attached to a chat message in the UI. Live messages may carry a preview. */
export interface ChatMessageAttachment extends MessageAttachmentMeta {
  preview?: string;
}

/** Persisted on `chat_messages.attachments` (metadata + extracted text only). */
export interface StoredMessageAttachment extends MessageAttachmentMeta {
  text?: string | null;
  truncated?: boolean;
}

export const MAX_MESSAGE_ATTACHMENTS = 5;
export const MAX_MESSAGE_IMAGES = 4;
export const MAX_MESSAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB per file
export const MAX_MESSAGE_ATTACHMENT_TOTAL_BYTES = 15 * 1024 * 1024; // 15MB combined

export const ALLOWED_MESSAGE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export const ALLOWED_MESSAGE_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"] as const;

/**
 * `.ppt` is intentionally excluded: there is no reliable Workers-compatible
 * text extractor for the legacy binary format.
 */
export const ALLOWED_MESSAGE_DOCUMENT_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".csv",
  ".txt",
  ".xls",
  ".xlsx",
  ".pptx",
] as const;

export const DEFAULT_ATTACHMENT_PROMPT =
  "Review the attached file(s) and use them as context for my post.";

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function isAllowedMessageDocumentName(name: string): boolean {
  return (ALLOWED_MESSAGE_DOCUMENT_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

export function inferAttachmentKind(file: { name: string; type: string }): MessageAttachmentKind {
  const type = file.type.toLowerCase();
  const ext = extensionOf(file.name);
  if (type.startsWith("image/")) return "image";
  if ((ALLOWED_MESSAGE_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return "image";
  return "document";
}

function isAllowedMessageImage(file: { name: string; type: string }): boolean {
  const type = file.type.toLowerCase();
  const ext = extensionOf(file.name);
  if (type) {
    if (!type.startsWith("image/")) return false;
    if (!(ALLOWED_MESSAGE_IMAGE_TYPES as readonly string[]).includes(type)) return false;
  }
  return (
    (ALLOWED_MESSAGE_IMAGE_EXTENSIONS as readonly string[]).includes(ext) ||
    (ALLOWED_MESSAGE_IMAGE_TYPES as readonly string[]).includes(type)
  );
}

export interface ValidateMessageAttachmentBatchResult {
  accepted: File[];
  errors: string[];
}

function attachmentErrorForFile(file: File): string | null {
  const kind = inferAttachmentKind(file);
  if (kind === "image") {
    if (!isAllowedMessageImage(file)) {
      return `"${file.name}" uses an unsupported image format. Use JPEG, PNG, GIF, or WebP.`;
    }
  } else if (!isAllowedMessageDocumentName(file.name)) {
    if (extensionOf(file.name) === ".ppt") {
      return `".ppt" files aren't supported. Save "${file.name}" as .pptx and attach again.`;
    }
    return `"${file.name}" — unsupported file type.`;
  }
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_MESSAGE_ATTACHMENT_BYTES) {
    return `"${file.name}" is ${formatBytes(file.size)} — max is ${formatBytes(
      MAX_MESSAGE_ATTACHMENT_BYTES,
    )}.`;
  }
  return null;
}

/**
 * Validate a batch of files against the chat attachment limits. Uses the same
 * per-file rules on the server; the server always re-validates.
 */
export function validateMessageAttachmentBatch(
  incoming: File[],
  existing: MessageAttachmentMeta[],
): ValidateMessageAttachmentBatchResult {
  const errors: string[] = [];
  const accepted: File[] = [];

  let remainingSlots = MAX_MESSAGE_ATTACHMENTS - existing.length;
  let remainingImages = MAX_MESSAGE_IMAGES - existing.filter((a) => a.kind === "image").length;
  let runningBytes = existing.reduce((sum, a) => sum + (a.size || 0), 0);

  if (remainingSlots <= 0) {
    return {
      accepted,
      errors: [`You can attach up to ${MAX_MESSAGE_ATTACHMENTS} files per message.`],
    };
  }

  for (const file of incoming) {
    if (remainingSlots <= 0) {
      errors.push(`Only ${MAX_MESSAGE_ATTACHMENTS} files allowed — "${file.name}" skipped.`);
      continue;
    }

    const error = attachmentErrorForFile(file);
    if (error) {
      errors.push(error);
      continue;
    }

    const kind = inferAttachmentKind(file);
    if (kind === "image" && remainingImages <= 0) {
      errors.push(
        `Only ${MAX_MESSAGE_IMAGES} images allowed per message — "${file.name}" skipped.`,
      );
      continue;
    }

    if (runningBytes + file.size > MAX_MESSAGE_ATTACHMENT_TOTAL_BYTES) {
      errors.push(
        `Adding "${file.name}" would exceed the ${formatBytes(
          MAX_MESSAGE_ATTACHMENT_TOTAL_BYTES,
        )} total limit for message attachments.`,
      );
      continue;
    }

    accepted.push(file);
    remainingSlots -= 1;
    if (kind === "image") remainingImages -= 1;
    runningBytes += file.size;
  }

  return { accepted, errors };
}

/** Maps persisted rows to the lightweight metadata rendered in a chat bubble. */
export function toChatMessageAttachments(raw: unknown): ChatMessageAttachment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const attachments: ChatMessageAttachment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { name, size, mimeType, kind } = entry as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) continue;
    if (kind !== "image" && kind !== "document") continue;
    attachments.push({
      name,
      size: typeof size === "number" && Number.isFinite(size) ? size : 0,
      mimeType: typeof mimeType === "string" ? mimeType : "application/octet-stream",
      kind,
    });
  }
  return attachments.length ? attachments : undefined;
}
