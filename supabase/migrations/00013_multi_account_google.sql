-- Multi-Account Google Services Integration
-- Replaces single-token google_oauth_tokens with multi-account support

-- Create google_accounts table for multi-account support
CREATE TABLE IF NOT EXISTS google_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Account identification
  google_email text NOT NULL,
  google_user_id text,
  account_label text NOT NULL DEFAULT 'Primary',

  -- OAuth tokens
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_type text DEFAULT 'Bearer',
  expires_at timestamptz NOT NULL,
  scopes text[],

  -- Status
  is_active boolean DEFAULT true,
  last_sync_at timestamptz,
  sync_error text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Ensure one Google account can only be connected once per user
  UNIQUE(user_id, google_user_id)
);

-- Create gmail_watch_channels table for real-time sync
CREATE TABLE IF NOT EXISTS gmail_watch_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_account_id uuid NOT NULL REFERENCES google_accounts(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  resource_id text NOT NULL,
  history_id text NOT NULL,
  expiration timestamptz NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),

  UNIQUE(google_account_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_google_accounts_user_id ON google_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_google_accounts_google_user_id ON google_accounts(google_user_id);
CREATE INDEX IF NOT EXISTS idx_google_accounts_active ON google_accounts(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_gmail_watch_channels_account ON gmail_watch_channels(google_account_id);
CREATE INDEX IF NOT EXISTS idx_gmail_watch_channels_expiration ON gmail_watch_channels(expiration) WHERE is_active = true;

-- Migrate existing data from google_oauth_tokens if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'google_oauth_tokens') THEN
    INSERT INTO google_accounts (
      user_id,
      google_email,
      google_user_id,
      account_label,
      access_token,
      refresh_token,
      token_type,
      expires_at,
      scopes,
      is_active,
      created_at,
      updated_at
    )
    SELECT
      user_id,
      COALESCE(email, 'unknown@gmail.com'),
      COALESCE(google_user_id, gen_random_uuid()::text),
      'Primary',
      access_token,
      refresh_token,
      COALESCE(token_type, 'Bearer'),
      COALESCE(expires_at, now() + interval '1 hour'),
      scopes,
      true,
      COALESCE(created_at, now()),
      COALESCE(updated_at, now())
    FROM google_oauth_tokens
    ON CONFLICT (user_id, google_user_id) DO NOTHING;
  END IF;
END $$;

-- Enable RLS on new tables
ALTER TABLE google_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_watch_channels ENABLE ROW LEVEL SECURITY;

-- RLS policies for google_accounts
CREATE POLICY "Users can view their own Google accounts"
  ON google_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Google accounts"
  ON google_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Google accounts"
  ON google_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Google accounts"
  ON google_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for gmail_watch_channels
CREATE POLICY "Users can view their own Gmail watch channels"
  ON gmail_watch_channels FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Gmail watch channels"
  ON gmail_watch_channels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Gmail watch channels"
  ON gmail_watch_channels FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Gmail watch channels"
  ON gmail_watch_channels FOR DELETE
  USING (auth.uid() = user_id);

-- Create updated_at trigger for google_accounts
CREATE OR REPLACE FUNCTION update_google_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER google_accounts_updated_at
  BEFORE UPDATE ON google_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_google_accounts_updated_at();
