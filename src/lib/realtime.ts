import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

let seq = 0;

/**
 * Creates a Supabase Realtime channel with a unique topic.
 *
 * `supabase.channel()` returns an *existing* channel when one with the same
 * topic is still registered — and `removeChannel()` (used in effect cleanup)
 * is async, so a channel can linger for a moment after unmount. If an effect
 * re-runs in that window (e.g. React StrictMode double-mount, or a dependency
 * identity change), the already-joined channel is returned and calling
 * `.on("postgres_changes", ...)` on it throws:
 *   "cannot add postgres_changes callbacks for realtime:<topic> after subscribe()"
 *
 * Giving every subscription a unique topic makes that race impossible.
 * Always pair with `supabase.removeChannel(ch)` in the effect cleanup.
 */
export function createUniqueChannel(base: string): RealtimeChannel {
  seq += 1;
  const nonce = Math.random().toString(36).slice(2, 8);
  return supabase.channel(`${base}#${seq}-${nonce}`);
}
