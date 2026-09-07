-- Conversation grouping for the Inbox: normalized subject plus the person.
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS thread_key text;
CREATE INDEX IF NOT EXISTS email_messages_thread_idx ON email_messages(workspace_id, thread_key, sent_at DESC);
