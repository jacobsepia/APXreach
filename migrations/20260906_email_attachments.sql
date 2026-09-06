-- Names, sizes and types of what was attached to a sent email. The files
-- themselves stay in the mailbox's Sent folder; Reach keeps the record.
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS attachments jsonb;
