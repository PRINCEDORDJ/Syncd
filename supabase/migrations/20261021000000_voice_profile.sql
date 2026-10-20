-- ============================================================================
-- Migration: Voice Map — structured voice profile
-- profiles.voice_profile holds the structured voice map (POV, style,
-- habits, banned words, themes, example excerpt) used by the engine to
-- mirror the user's natural writing in every generation.
-- Legacy `profiles.voice_notes` (free-form text) is kept unchanged and
-- rendered as secondary context after the structured map.
-- Shape contract lives in src/lib/voice-profile.ts (zod schema).
-- ============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS voice_profile JSONB;

COMMENT ON COLUMN public.profiles.voice_profile IS
  'Structured voice map (shape contract in src/lib/voice-profile.ts): point_of_view, style_rhythm, structural_habits, avoid_words, signature_themes, example_excerpt.';
