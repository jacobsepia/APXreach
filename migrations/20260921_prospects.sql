CREATE TABLE IF NOT EXISTS prospect_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  file_name text NOT NULL,
  file_hash text NOT NULL,
  row_count integer NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, file_hash)
);
CREATE TABLE IF NOT EXISTS prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  import_id uuid NOT NULL REFERENCES prospect_imports(id),
  source_sheet text NOT NULL,
  source_row integer NOT NULL,
  raw jsonb NOT NULL,
  data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'research' CHECK (status IN ('research','ready','contacted','nurture','qualified','disqualified','duplicate')),
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  task_id uuid REFERENCES activities(id) ON DELETE SET NULL,
  owner_name text,
  next_action text,
  next_action_date date,
  review_notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(import_id, source_sheet, source_row)
);
CREATE INDEX IF NOT EXISTS prospects_workspace_status_idx ON prospects(workspace_id, status);
CREATE INDEX IF NOT EXISTS prospects_company_idx ON prospects(company_id);
