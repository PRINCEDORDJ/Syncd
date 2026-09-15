-- Migration: Save Google Avatar and Profile Info on Auth
-- Updates handle_new_user and adds handle_user_metadata_update trigger

-- 1. Redefine handle_new_user to extract avatar_url and display_name from OAuth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name TEXT;
  v_avatar_url TEXT;
BEGIN
  v_display_name := COALESCE(
    NEW.raw_user_meta_data ->> 'display_name',
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    split_part(NEW.email, '@', 1)
  );

  v_avatar_url := COALESCE(
    NEW.raw_user_meta_data ->> 'avatar_url',
    NEW.raw_user_meta_data ->> 'picture'
  );

  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (NEW.id, v_display_name, v_avatar_url)
  ON CONFLICT (user_id) DO UPDATE
  SET
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
    avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
    updated_at = now();

  RETURN NEW;
END;
$$;

-- 2. Trigger function to sync OAuth metadata (avatar_url and display_name) when auth.users is updated
CREATE OR REPLACE FUNCTION public.handle_user_metadata_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name TEXT;
  v_avatar_url TEXT;
BEGIN
  v_display_name := COALESCE(
    NEW.raw_user_meta_data ->> 'display_name',
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name'
  );

  v_avatar_url := COALESCE(
    NEW.raw_user_meta_data ->> 'avatar_url',
    NEW.raw_user_meta_data ->> 'picture'
  );

  -- Only backfill/update profiles if avatar_url or display_name is missing.
  UPDATE public.profiles
  SET
    display_name = COALESCE(public.profiles.display_name, v_display_name),
    avatar_url = COALESCE(public.profiles.avatar_url, v_avatar_url),
    updated_at = now()
  WHERE user_id = NEW.id
    AND (public.profiles.avatar_url IS NULL OR public.profiles.display_name IS NULL);

  RETURN NEW;
END;
$$;

-- 3. Set trigger permissions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE ALL ON FUNCTION public.handle_user_metadata_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_user_metadata_update() TO service_role;

-- 4. Create trigger for auth.users update
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
AFTER UPDATE OF raw_user_meta_data, last_sign_in_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_user_metadata_update();

-- 5. Backfill existing profiles with avatar_url or display_name from auth.users metadata
UPDATE public.profiles p
SET
  avatar_url = COALESCE(p.avatar_url, u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
  display_name = COALESCE(p.display_name, u.raw_user_meta_data ->> 'display_name', u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  updated_at = now()
FROM auth.users u
WHERE p.user_id = u.id
  AND (p.avatar_url IS NULL OR p.display_name IS NULL)
  AND (u.raw_user_meta_data ->> 'avatar_url' IS NOT NULL
       OR u.raw_user_meta_data ->> 'picture' IS NOT NULL
       OR u.raw_user_meta_data ->> 'full_name' IS NOT NULL
       OR u.raw_user_meta_data ->> 'name' IS NOT NULL);
