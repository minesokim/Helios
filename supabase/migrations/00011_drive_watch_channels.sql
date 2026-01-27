-- Drive Watch Channels for Real-Time Sync
-- Stores Google Drive push notification channels for real-time file updates

-- Create drive_watch_channels table
CREATE TABLE IF NOT EXISTS drive_watch_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  resource_id text NOT NULL,
  page_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(user_id)
);

-- Create index for channel lookups (from webhook)
CREATE INDEX IF NOT EXISTS idx_drive_watch_channel_lookup
  ON drive_watch_channels(channel_id, resource_id);

-- Create index for expiration checks
CREATE INDEX IF NOT EXISTS idx_drive_watch_expires
  ON drive_watch_channels(expires_at);

-- Enable RLS
ALTER TABLE drive_watch_channels ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own watch channels" ON drive_watch_channels
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watch channels" ON drive_watch_channels
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watch channels" ON drive_watch_channels
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own watch channels" ON drive_watch_channels
  FOR DELETE USING (auth.uid() = user_id);

-- Add auto-categorization settings to user preferences (if not exists)
-- This allows users to enable/disable auto-categorization of new Drive files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences'
    AND column_name = 'drive_auto_categorize'
  ) THEN
    ALTER TABLE user_preferences
    ADD COLUMN drive_auto_categorize boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences'
    AND column_name = 'drive_realtime_sync'
  ) THEN
    ALTER TABLE user_preferences
    ADD COLUMN drive_realtime_sync boolean DEFAULT true;
  END IF;
END $$;

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_drive_watch_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_drive_watch_channels_updated_at ON drive_watch_channels;
CREATE TRIGGER trigger_drive_watch_channels_updated_at
  BEFORE UPDATE ON drive_watch_channels
  FOR EACH ROW
  EXECUTE FUNCTION update_drive_watch_channels_updated_at();

-- Add webhook processing to audit log actions (if needed)
-- This allows tracking webhook activity in the existing audit log
COMMENT ON TABLE drive_watch_channels IS 'Stores Google Drive push notification channels for real-time file sync. Channels expire after 24h and must be renewed.';
