-- Plan tier enum
CREATE TYPE public.plan_tier AS ENUM ('trial', 'studio', 'teams');

-- Subscription status enum
CREATE TYPE public.subscription_status AS ENUM ('active', 'canceled', 'past_due', 'expired', 'trialing');

-- Subscriptions table
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  plan plan_tier NOT NULL DEFAULT 'trial',
  status subscription_status NOT NULL DEFAULT 'trialing',
  polar_customer_id TEXT,
  polar_subscription_id TEXT UNIQUE,
  polar_product_id TEXT,
  current_period_end TIMESTAMP WITH TIME ZONE,
  trial_end TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '7 days'),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_polar_subscription_id ON public.subscriptions(polar_subscription_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscription
CREATE POLICY "Users view own subscription"
ON public.subscriptions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- No client-side INSERT/UPDATE/DELETE - only service role (webhooks) can modify

-- Updated_at trigger
CREATE TRIGGER update_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create trial subscription on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan, status, trial_end)
  VALUES (NEW.id, 'trial', 'trialing', now() + INTERVAL '7 days')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger on auth.users insert (chained alongside existing handle_new_user)
DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_subscription();

-- Backfill subscriptions for existing users
INSERT INTO public.subscriptions (user_id, plan, status, trial_end)
SELECT id, 'trial', 'trialing', now() + INTERVAL '7 days'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- Helper function: get effective plan for a user
CREATE OR REPLACE FUNCTION public.get_user_plan(_user_id UUID)
RETURNS plan_tier
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN s.status IN ('active', 'trialing') AND (s.current_period_end IS NULL OR s.current_period_end > now())
        AND (s.plan != 'trial' OR (s.trial_end IS NULL OR s.trial_end > now()))
      THEN s.plan
      ELSE 'trial'::plan_tier
    END
  FROM public.subscriptions s
  WHERE s.user_id = _user_id
  LIMIT 1;
$$;