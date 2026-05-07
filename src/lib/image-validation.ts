export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB per image
export const MAX_TOTAL_BYTES = 15 * 1024 * 1024; // 15MB combined
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Approximate the byte size of a base64 data URL. */
export function dataUrlByteSize(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

export type ImageValidation =
  | { ok: true; file: File }
  | { ok: false; reason: string };

export function validateImageFile(file: File): ImageValidation {
  if (!file.type.startsWith("image/")) {
    return { ok: false, reason: `"${file.name}" is not an image.` };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return {
      ok: false,
      reason: `"${file.name}" uses an unsupported format. Use JPEG, PNG, GIF, or WebP.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, reason: `"${file.name}" is empty.` };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      reason: `"${file.name}" is ${formatBytes(file.size)} — max is ${formatBytes(MAX_IMAGE_BYTES)}.`,
    };
  }
  return { ok: true, file };
}

export interface ValidateBatchResult {
  accepted: File[];
  errors: string[];
}

/**
 * Validate a batch of incoming files against per-file rules, the remaining slot
 * count, and the combined byte budget (existing + new). Returns the files that
 * are safe to attach plus user-facing error messages for everything rejected.
 */
export function validateImageBatch(
  incoming: File[],
  existingCount: number,
  existingBytes: number,
): ValidateBatchResult {
  const errors: string[] = [];
  const accepted: File[] = [];
  let remainingSlots = MAX_IMAGES - existingCount;
  let runningBytes = existingBytes;

  if (remainingSlots <= 0) {
    errors.push(`You can attach up to ${MAX_IMAGES} images.`);
    return { accepted, errors };
  }

  for (const file of incoming) {
    if (remainingSlots <= 0) {
      errors.push(`Only ${MAX_IMAGES} images allowed — "${file.name}" skipped.`);
      continue;
    }
    const result = validateImageFile(file);
    if (!result.ok) {
      errors.push(result.reason);
      continue;
    }
    if (runningBytes + file.size > MAX_TOTAL_BYTES) {
      errors.push(
        `Adding "${file.name}" would exceed the ${formatBytes(MAX_TOTAL_BYTES)} total limit.`,
      );
      continue;
    }
    accepted.push(file);
    runningBytes += file.size;
    remainingSlots -= 1;
  }

  return { accepted, errors };
}