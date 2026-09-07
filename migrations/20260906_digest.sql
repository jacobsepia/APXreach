-- The morning digest preference, per membership. On by default; a quiet day sends nothing.
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS digest_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS digest_last_sent_at timestamptz;
