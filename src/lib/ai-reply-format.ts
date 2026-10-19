/**
 * Parser for the AI model's delimiter protocol (<<<THOUGHTS>>> / <<<POST>>> /
 * <<<EDIT>>> blocks). Shared between the browser workspace context (which
 * applies results to the canvas) and the /api/generate server route (which
 * persists the conversational part of each turn).
 */

/** A single exact search/replace instruction parsed out of an <<<EDIT>>> block. */
export interface EditOp {
  old: string;
  new: string;
}

export interface DualStreamResult {
  thoughts: string;
  post: string | null;
  editOps: EditOp[];
  isKeepCurrent: boolean;
}

const THOUGHTS_TAG = "<<<THOUGHTS>>>";
const POST_TAG = "<<<POST>>>";
const EDIT_TAG = "<<<EDIT>>>";
const END_EDIT_TAG = "<<<END_EDIT>>>";
const OLD_TAG = "<<<OLD>>>";
const END_OLD_TAG = "<<<END_OLD>>>";
const NEW_TAG = "<<<NEW>>>";
const END_NEW_TAG = "<<<END_NEW>>>";

/** Parses every complete OLD/NEW pair inside an <<<EDIT>>>…<<<END_EDIT>>> block. */
function parseEditOps(raw: string): EditOp[] {
  const editStart = raw.indexOf(EDIT_TAG);
  if (editStart === -1) return [];
  const bodyStart = editStart + EDIT_TAG.length;
  const editEnd = raw.indexOf(END_EDIT_TAG, bodyStart);
  const body = raw.slice(bodyStart, editEnd === -1 ? undefined : editEnd);
  const ops: EditOp[] = [];
  let idx = 0;
  while (idx < body.length) {
    const oldAt = body.indexOf(OLD_TAG, idx);
    if (oldAt === -1) break;
    const oldEnd = body.indexOf(END_OLD_TAG, oldAt);
    if (oldEnd === -1) break;
    const newAt = body.indexOf(NEW_TAG, oldEnd);
    if (newAt === -1) break;
    const newEnd = body.indexOf(END_NEW_TAG, newAt);
    if (newEnd === -1) break;
    const oldText = body.slice(oldAt + OLD_TAG.length, oldEnd);
    const newText = body.slice(newAt + NEW_TAG.length, newEnd);
    if (oldText.trim().length > 0) ops.push({ old: oldText, new: newText });
    idx = newEnd + END_NEW_TAG.length;
  }
  return ops;
}

export function parseDualStream(raw: string): DualStreamResult {
  const thoughtsIndex = raw.indexOf(THOUGHTS_TAG);
  const postIndex = raw.indexOf(POST_TAG);
  const editIndex = raw.indexOf(EDIT_TAG);

  if (thoughtsIndex === -1 && postIndex === -1 && editIndex === -1) {
    return { thoughts: raw, post: null, editOps: [], isKeepCurrent: false };
  }

  // Thoughts run from after the thoughts tag up to the first content section.
  let thoughts = "";
  if (thoughtsIndex !== -1) {
    const boundaries = [postIndex, editIndex].filter((i) => i > thoughtsIndex);
    const end = boundaries.length ? Math.min(...boundaries) : raw.length;
    thoughts = raw.slice(thoughtsIndex + THOUGHTS_TAG.length, end).trim();
  } else {
    const firstSection =
      postIndex === -1 ? editIndex : editIndex === -1 ? postIndex : Math.min(postIndex, editIndex);
    thoughts = raw.slice(0, Math.max(firstSection, 0)).trim();
  }

  // A targeted edit takes precedence — never apply both edit and post.
  if (editIndex !== -1) {
    return { thoughts, post: null, editOps: parseEditOps(raw), isKeepCurrent: false };
  }

  if (postIndex !== -1) {
    const postContent = raw.slice(postIndex + POST_TAG.length).trimStart();
    if (postContent.startsWith("KEEP_CURRENT")) {
      return { thoughts, post: null, editOps: [], isKeepCurrent: true };
    }
    return { thoughts, post: postContent, editOps: [], isKeepCurrent: false };
  }

  return { thoughts, post: null, editOps: [], isKeepCurrent: false };
}

export function isCanvasEditResult(parsed: DualStreamResult): boolean {
  return (parsed.post !== null && !parsed.isKeepCurrent) || parsed.editOps.length > 0;
}

export const EDIT_FAILURE_MESSAGE =
  "I couldn't apply that edit precisely — the canvas changed or the match wasn't unique. Try rephrasing the instruction, or ask for a full rewrite.";

type ApplyOutcome =
  | { status: "replace"; text: string; canvasEdited: boolean }
  | { status: "keep" }
  | { status: "failed"; message: string };

/**
 * Applies the model's output to the current canvas.
 * Targeted edit ops must match the canvas exactly and uniquely, otherwise the
 * canvas is left untouched and the caller surfaces `message`.
 */
export function applyCanvasResult(
  current: string,
  { post, editOps, isKeepCurrent }: Pick<DualStreamResult, "post" | "editOps" | "isKeepCurrent">,
): ApplyOutcome {
  if (editOps.length > 0) {
    let next = current;
    for (const op of editOps) {
      const occurrences = next.split(op.old).length - 1;
      if (occurrences !== 1) return { status: "failed", message: EDIT_FAILURE_MESSAGE };
      next = next.replace(op.old, op.new);
    }
    if (next.length > 3000) {
      return {
        status: "failed",
        message:
          "That edit would push the post past the 3,000-character limit, so I left the canvas untouched. Ask me to shorten it instead.",
      };
    }
    if (next === current) return { status: "keep" };
    return { status: "replace", text: next, canvasEdited: true };
  }
  if (post !== null && !isKeepCurrent) {
    if (!post.trim()) return { status: "keep" };
    return { status: "replace", text: post, canvasEdited: true };
  }
  return { status: "keep" };
}
