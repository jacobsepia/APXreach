CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  key text NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  revision text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_templates_workspace_key_idx UNIQUE(workspace_id, key)
);
