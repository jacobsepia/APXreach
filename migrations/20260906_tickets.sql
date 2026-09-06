-- Pipelines gain a kind so a support board can share the stage engine with
-- the sales board without appearing on it. Existing pipelines are sales.
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'sales';

CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  pipeline_id uuid NOT NULL REFERENCES pipelines(id),
  stage_id uuid NOT NULL REFERENCES pipeline_stages(id),
  subject text NOT NULL,
  body text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  company_id uuid REFERENCES companies(id),
  contact_id uuid REFERENCES contacts(id),
  owner_name text,
  email_message_id uuid,
  first_response_due_at timestamptz NOT NULL,
  resolve_due_at timestamptz NOT NULL,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tickets_workspace_status_idx ON tickets(workspace_id, status);
CREATE INDEX IF NOT EXISTS tickets_email_message_idx ON tickets(email_message_id);
