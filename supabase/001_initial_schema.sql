-- ============================================================
-- Campaign Launcher OS — Supabase Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================
CREATE TYPE conversion_event AS ENUM (
  'PURCHASE',
  'INITIATE_CHECKOUT',
  'LEAD',
  'COMPLETE_REGISTRATION',
  'ADD_TO_CART',
  'VIEW_CONTENT',
  'CUSTOM'
);

CREATE TYPE gender_targeting AS ENUM ('ALL', 'MALE', 'FEMALE');

CREATE TYPE cta_type AS ENUM (
  'SHOP_NOW',
  'LEARN_MORE',
  'SIGN_UP',
  'CONTACT_US',
  'SUBSCRIBE',
  'WHATSAPP_MESSAGE',
  'GET_OFFER',
  'ORDER_NOW'
);

CREATE TYPE launch_status AS ENUM (
  'PENDING',
  'PROCESSING',
  'SUCCESS',
  'PARTIAL_SUCCESS',
  'FAILED'
);

CREATE TYPE log_level AS ENUM ('INFO', 'WARNING', 'ERROR', 'SUCCESS');

CREATE TYPE flow_type AS ENUM ('ABO_TEST', 'CBO_SCALE');

-- ============================================================
-- USERS (extends Supabase Auth)
-- ============================================================
CREATE TABLE public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  full_name       TEXT,
  avatar_url      TEXT,
  timezone        TEXT DEFAULT 'America/Mexico_City',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- META CONNECTIONS
-- Stores the encrypted OAuth token per user
-- ============================================================
CREATE TABLE public.meta_connections (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  meta_user_id        TEXT NOT NULL,
  meta_user_name      TEXT,
  encrypted_token     TEXT NOT NULL,            -- AES-256-GCM encrypted
  token_expires_at    TIMESTAMPTZ,              -- Long-lived token expiry (~60 days)
  scopes              TEXT[],                   -- Granted scopes
  is_active           BOOLEAN DEFAULT TRUE,
  connected_at        TIMESTAMPTZ DEFAULT NOW(),
  last_used_at        TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, meta_user_id)
);

-- ============================================================
-- AD ACCOUNTS
-- Cached list of ad accounts per user
-- ============================================================
CREATE TABLE public.ad_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  connection_id   UUID NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  account_id      TEXT NOT NULL,               -- e.g. "act_12345678"
  account_name    TEXT NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  account_status  INTEGER,                     -- 1=Active, 2=Disabled, 9=InGracePeriod
  business_id     TEXT,
  is_selected     BOOLEAN DEFAULT FALSE,       -- Currently selected for launches
  last_synced_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, account_id)
);

-- ============================================================
-- PIXELS
-- ============================================================
CREATE TABLE public.pixels (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ad_account_id   UUID REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  pixel_id        TEXT NOT NULL,
  pixel_name      TEXT NOT NULL,
  is_selected     BOOLEAN DEFAULT FALSE,
  last_synced_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, pixel_id)
);

-- ============================================================
-- FACEBOOK PAGES
-- ============================================================
CREATE TABLE public.facebook_pages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  page_id         TEXT NOT NULL,
  page_name       TEXT NOT NULL,
  page_category   TEXT,
  is_selected     BOOLEAN DEFAULT FALSE,
  last_synced_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, page_id)
);

-- ============================================================
-- INSTAGRAM ACCOUNTS
-- ============================================================
CREATE TABLE public.instagram_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  page_id         UUID REFERENCES public.facebook_pages(id) ON DELETE CASCADE,
  ig_account_id   TEXT NOT NULL,
  ig_username     TEXT,
  is_selected     BOOLEAN DEFAULT FALSE,
  last_synced_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, ig_account_id)
);

-- ============================================================
-- CAMPAIGN LAUNCHES
-- Main record for each launch attempt
-- ============================================================
CREATE TABLE public.campaign_launches (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  flow_type               flow_type DEFAULT 'ABO_TEST',

  -- Form inputs
  product_name            TEXT NOT NULL,
  country                 TEXT NOT NULL,         -- ISO country code: MX, US, CO...
  destination_url         TEXT NOT NULL,
  daily_budget_per_adset  DECIMAL(10,2) NOT NULL, -- In major currency unit
  conversion_event        conversion_event NOT NULL,
  primary_text            TEXT NOT NULL,
  headline                TEXT NOT NULL,
  description             TEXT,
  cta_type                cta_type NOT NULL DEFAULT 'SHOP_NOW',
  age_min                 INTEGER NOT NULL DEFAULT 18,
  age_max                 INTEGER NOT NULL DEFAULT 65,
  gender                  gender_targeting NOT NULL DEFAULT 'ALL',
  use_advantage_plus      BOOLEAN DEFAULT TRUE,

  -- Meta assets used
  ad_account_id           TEXT NOT NULL,         -- act_XXXXXXX
  pixel_id                TEXT NOT NULL,
  page_id                 TEXT NOT NULL,
  ig_account_id           TEXT,

  -- Generated campaign info
  campaign_name           TEXT,                  -- ABO_TEST_ECHOFREE_MX_120526
  meta_campaign_id        TEXT,                  -- ID returned by Meta
  total_daily_budget      DECIMAL(10,2),         -- budget × num_videos
  final_url_with_utms     TEXT,

  -- Status
  status                  launch_status DEFAULT 'PENDING',
  video_count             INTEGER DEFAULT 0,
  adsets_created          INTEGER DEFAULT 0,
  ads_created             INTEGER DEFAULT 0,
  error_message           TEXT,

  created_at              TIMESTAMPTZ DEFAULT NOW(),
  completed_at            TIMESTAMPTZ
);

-- ============================================================
-- UPLOADED VIDEOS
-- Each video uploaded as part of a launch
-- ============================================================
CREATE TABLE public.uploaded_videos (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  launch_id           UUID NOT NULL REFERENCES public.campaign_launches(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- File info
  original_filename   TEXT NOT NULL,
  file_size_bytes     BIGINT,
  mime_type           TEXT,
  duration_seconds    INTEGER,

  -- Supabase Storage
  storage_path        TEXT,                     -- path in supabase storage bucket

  -- Meta upload
  meta_video_id       TEXT,                     -- Video ID in Meta
  meta_adset_id       TEXT,                     -- Ad Set created for this video
  meta_creative_id    TEXT,                     -- Creative created for this video
  meta_ad_id          TEXT,                     -- Ad created for this video

  -- Naming
  adset_name          TEXT,                     -- ADSET_01_HOOK_DOLOR
  ad_name             TEXT,                     -- AD_01_HOOK_DOLOR

  -- Processing
  upload_status       TEXT DEFAULT 'pending',   -- pending | uploading | processing | ready | failed
  meta_upload_status  TEXT,                     -- Meta's own status: ready | processing | error
  sort_order          INTEGER DEFAULT 0,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  uploaded_at         TIMESTAMPTZ
);

-- ============================================================
-- LAUNCH LOGS
-- Step-by-step log for each launch (useful for debugging)
-- ============================================================
CREATE TABLE public.launch_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  launch_id   UUID NOT NULL REFERENCES public.campaign_launches(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  level       log_level DEFAULT 'INFO',
  step        TEXT NOT NULL,           -- e.g. "CREATE_CAMPAIGN", "UPLOAD_VIDEO_1"
  message     TEXT NOT NULL,
  meta_request_id TEXT,               -- Meta's trace ID for debugging
  payload     JSONB,                   -- Request/response data (sanitized)
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ERROR LOG
-- Persistent errors for admin visibility
-- ============================================================
CREATE TABLE public.error_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  launch_id       UUID REFERENCES public.campaign_launches(id) ON DELETE SET NULL,
  error_code      TEXT,
  error_type      TEXT,
  error_message   TEXT NOT NULL,
  stack_trace     TEXT,
  meta_error_code INTEGER,
  meta_fbtrace_id TEXT,               -- For Meta support tickets
  resolved        BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_meta_connections_user     ON public.meta_connections(user_id);
CREATE INDEX idx_ad_accounts_user          ON public.ad_accounts(user_id);
CREATE INDEX idx_pixels_user               ON public.pixels(user_id);
CREATE INDEX idx_pages_user                ON public.facebook_pages(user_id);
CREATE INDEX idx_launches_user             ON public.campaign_launches(user_id);
CREATE INDEX idx_launches_status           ON public.campaign_launches(status);
CREATE INDEX idx_uploaded_videos_launch    ON public.uploaded_videos(launch_id);
CREATE INDEX idx_launch_logs_launch        ON public.launch_logs(launch_id);
CREATE INDEX idx_error_log_user            ON public.error_log(user_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Users can only see their own data
-- ============================================================
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_connections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pixels              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_pages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_launches   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_videos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launch_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_log           ENABLE ROW LEVEL SECURITY;

-- Policies: each user sees only their rows
CREATE POLICY "Users own their profile"
  ON public.profiles FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users own their meta connections"
  ON public.meta_connections FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their ad accounts"
  ON public.ad_accounts FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their pixels"
  ON public.pixels FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their pages"
  ON public.facebook_pages FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their instagram accounts"
  ON public.instagram_accounts FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their launches"
  ON public.campaign_launches FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their videos"
  ON public.uploaded_videos FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their logs"
  ON public.launch_logs FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their errors"
  ON public.error_log FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();
