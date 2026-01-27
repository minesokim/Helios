-- Add google_account_id to drive_files for multi-account support

-- Add the column
ALTER TABLE drive_files
ADD COLUMN IF NOT EXISTS google_account_id uuid REFERENCES google_accounts(id) ON DELETE SET NULL;

-- Create index for filtering by account
CREATE INDEX IF NOT EXISTS idx_drive_files_google_account_id ON drive_files(google_account_id);

-- Create composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_drive_files_user_account ON drive_files(user_id, google_account_id);

-- Update existing files to link to primary account (if available)
-- This is a best-effort migration - files without a matching account will have NULL
UPDATE drive_files df
SET google_account_id = ga.id
FROM google_accounts ga
WHERE df.user_id = ga.user_id
  AND df.google_account_id IS NULL
  AND ga.account_label = 'Primary';
