-- Campaigns: one email to a tagged list, through a sending service.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  tag_id uuid REFERENCES tags(id),
  from_name text NOT NULL,
  from_email text NOT NULL,
  reply_to text,
  status text NOT NULL DEFAULT 'draft',
  hold_dunning boolean NOT NULL DEFAULT true,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  held_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_by text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaigns_workspace_idx ON campaigns(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  provider_message_id text,
  sent_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_recipients_campaign_contact_idx ON campaign_recipients(campaign_id, contact_id);
