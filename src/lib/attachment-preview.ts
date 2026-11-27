import { inferAttachmentKind } from "@/lib/attachments";

/**
 * Browser-side preparation for chat attachments. Images are downscaled and
 * re-encoded before they leave the browser, which keeps both the request and
 * the persisted bytes reasonable. Documents are passed through unchanged.
 */

const MAX_IMAGE_DIMENSION = 1600;
const MAX_THUMB_DIMENSION = 320;
const IMAGE_QUALITY = 0.82;
const THUMB_QUALITY = 0.7;
/** Reuse the original bytes as a thumbnail only when they are already tiny. */
const MAX_ORIGINAL_THUMBNAIL_BYTES = 64 * 1024;

export interface PreparedMessageAttachment {
  dataUrl: string;
  thumbnail?: string;
  mimeType: string;
  size: number;
}

type Drawable = ImageBitmap | HTMLImageElement;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

/** Approximate decoded byte size of a base64 data URL. */
function approxDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  return Math.floor((dataUrl.length - comma - 1) * 0.75);
}

function mimeTypeOfDataUrl(dataUrl: string, fallback: string): string {
  const match = /^data:([^;,]+)[;,]/.exec(dataUrl);
  return match ? match[1].toLowerCase() : fallback;
}

function isGif(file: File): boolean {
  return file.type === "image/gif" || /\.gif$/i.test(file.name);
}

async function decodeImage(
  file: File,
): Promise<{ drawable: Drawable; cleanup: () => void } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { drawable: bitmap, cleanup: () => bitmap.close?.() };
    } catch {
      // Fall through to the <img> path (older browsers, odd encodings).
    }
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not decode image."));
      image.src = url;
    });
    return { drawable: image, cleanup: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function encodeResized(drawable: Drawable, maxDimension: number, quality: number): string | null {
  const width = drawable instanceof HTMLImageElement ? drawable.naturalWidth : drawable.width;
  const height = drawable instanceof HTMLImageElement ? drawable.naturalHeight : drawable.height;
  if (!width || !height) return null;

  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // JPEG is accepted by every supported provider. Fill white first so
  // transparent PNGs don't render with a black background.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(drawable, 0, 0, targetWidth, targetHeight);

  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Reads a file into a data URL, compressing images and producing a small
 * thumbnail. GIFs keep their original bytes so animation survives; only their
 * thumbnail is a static frame.
 */
export async function prepareMessageAttachment(file: File): Promise<PreparedMessageAttachment> {
  const original = await readAsDataUrl(file);
  const kind = inferAttachmentKind(file);
  const fallbackMime = file.type || "application/octet-stream";

  if (kind !== "image") {
    return { dataUrl: original, mimeType: fallbackMime, size: file.size };
  }

  const decoded = await decodeImage(file);
  if (!decoded) {
    return { dataUrl: original, mimeType: fallbackMime, size: file.size };
  }

  try {
    const full = isGif(file)
      ? original
      : encodeResized(decoded.drawable, MAX_IMAGE_DIMENSION, IMAGE_QUALITY);
    const thumbnail = encodeResized(decoded.drawable, MAX_THUMB_DIMENSION, THUMB_QUALITY);

    // Only swap in the re-encoded image when it is actually smaller.
    const dataUrl =
      full && approxDataUrlBytes(full) < approxDataUrlBytes(original) ? full : original;

    const thumb =
      thumbnail ??
      (approxDataUrlBytes(original) <= MAX_ORIGINAL_THUMBNAIL_BYTES ? original : undefined);

    return {
      dataUrl,
      ...(thumb ? { thumbnail: thumb } : {}),
      mimeType: mimeTypeOfDataUrl(dataUrl, fallbackMime),
      size: approxDataUrlBytes(dataUrl),
    };
  } finally {
    decoded.cleanup();
  }
}
