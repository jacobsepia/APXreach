-- Sequences: scheduled email series that stop themselves when the books say
-- paid or the customer replies. Nothing here sends until someone is enrolled.
CREATE TABLE IF NOT EXISTS sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  key text,
  name text NOT NULL,
  description text NOT NULL,
  kind text NOT NULL DEFAULT 'collections',
  stop_when_paid boolean NOT NULL DEFAULT true,
  stop_on_reply boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sequences_workspace_idx ON sequences(workspace_id);

CREATE TABLE IF NOT EXISTS sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES sequences(id),
  position integer NOT NULL,
  day_offset integer NOT NULL,
  template_key text NOT NULL
);
CREATE INDEX IF NOT EXISTS sequence_steps_sequence_idx ON sequence_steps(sequence_id, position);

CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  sequence_id uuid NOT NULL REFERENCES sequences(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  company_id uuid REFERENCES companies(id),
  mailbox_id uuid NOT NULL REFERENCES mailboxes(id),
  user_id text NOT NULL,
  invoice_number text,
  status text NOT NULL DEFAULT 'active',
  stop_reason text,
  next_position integer NOT NULL DEFAULT 0,
  next_due_at timestamptz,
  sent_count integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  last_error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS sequence_enrollments_due_idx ON sequence_enrollments(status, next_due_at);
CREATE INDEX IF NOT EXISTS sequence_enrollments_workspace_idx ON sequence_enrollments(workspace_id, status);
