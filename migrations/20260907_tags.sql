-- Tags on contacts: loose grouping a campaign or sequence can target.
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  color text NOT NULL DEFAULT 'plum',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tags_workspace_name_idx ON tags(workspace_id, lower(name));
CREATE TABLE IF NOT EXISTS contact_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  tag_id uuid NOT NULL REFERENCES tags(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_tags_contact_tag_idx ON contact_tags(contact_id, tag_id);
CREATE INDEX IF NOT EXISTS contact_tags_tag_idx ON contact_tags(tag_id);
