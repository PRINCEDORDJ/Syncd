-- Enable Realtime for linkedin_connections so clients get push updates
ALTER TABLE public.linkedin_connections REPLICA IDENTITY FULL;

-- RPC: delete all expired linkedin connections (called by the scheduler worker)
CREATE OR REPLACE FUNCTION public.expire_linkedin_connections()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.linkedin_connections
    WHERE expires_at < now()
    RETURNING id
  )
  SELECT count(*) INTO deleted_count FROM deleted;

  RETURN COALESCE(deleted_count, 0);
END;
$$;

-- Grant execution to service_role only
REVOKE ALL ON FUNCTION public.expire_linkedin_connections() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_linkedin_connections() TO service_role;
