-- ============================================================================
-- Daily credits reset function and pg_cron schedule
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_daily_credits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_credits
  SET daily_credits_used = 0,
      last_daily_reset = CURRENT_DATE,
      updated_at = now()
  WHERE last_daily_reset < CURRENT_DATE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_daily_credits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_daily_credits() TO service_role;

-- Schedule the cron job to run every day at midnight UTC (requires pg_cron extension)
DO $$
BEGIN
  -- Check if pg_cron extension is available before scheduling
  IF EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) THEN
    -- Ensure pg_cron is created if not already
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    -- Unschedule existing job if any to avoid duplicates
    PERFORM cron.unschedule('reset-daily-credits-job');

    -- Schedule new job
    PERFORM cron.schedule(
      'reset-daily-credits-job',
      '0 0 * * *',
      'SELECT public.reset_daily_credits();'
    );
  END IF;
END;
$$;
