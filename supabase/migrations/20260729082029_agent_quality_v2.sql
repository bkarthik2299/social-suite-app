-- Add the missing strategy stage and make AI runs reproducible and inspectable.
INSERT INTO ai_agents (slug, name, description, skill_md, tools, output_schema, permissions, is_default)
VALUES (
  'creative-strategist',
  'Creative Strategist',
  'Creates one campaign direction and distinct angles before channel writing begins.',
  $skill$# Creative Strategist

## Purpose
Turn the internal brief, campaign-specific brand rules, and evidence brief into one connected creative direction before channel writers begin.

## Workflow
1. Define one central campaign idea that is specific to the audience problem and desired action.
2. Set the promise, key messages, and calls to action without inventing proof.
3. Create distinct content angles so every requested asset has a useful job and does not repeat another asset.
4. Give concise platform guidance for organic social, Google Search, paid social, and blogs.
5. Produce the shared strategy title, rationale, objectives, and content pillars.

## Guardrails
- Use only confirmed brief facts, approved brand facts, and safely usable evidence.
- Do not introduce offers, statistics, testimonials, guarantees, services, or dates that are not supported.
- Keep the campaign connected without making every item use the same hook or phrasing.$skill$,
  ARRAY['context_reader'],
  'creative_direction',
  '{"can_write":false}'::jsonb,
  true
)
ON CONFLICT DO NOTHING;

INSERT INTO ai_agent_versions (agent_id, skill_md, change_note)
SELECT agent.id, agent.skill_md, 'Agent quality v2 baseline'
FROM ai_agents agent
WHERE agent.is_enabled = true
  AND NOT EXISTS (
    SELECT 1
    FROM ai_agent_versions version
    WHERE version.agent_id = agent.id
      AND version.skill_md = agent.skill_md
  );

ALTER TABLE ai_run_steps
  ADD COLUMN IF NOT EXISTS agent_version_id uuid REFERENCES ai_agent_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS output_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS model_id text,
  ADD COLUMN IF NOT EXISTS error_code text;

CREATE INDEX IF NOT EXISTS idx_ai_run_steps_agent_version
  ON ai_run_steps(agent_version_id);

CREATE TABLE IF NOT EXISTS ai_run_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('internal_brief', 'brand_instructions', 'research_brief', 'creative_direction', 'qa_report')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, document_type, version)
);

CREATE INDEX IF NOT EXISTS idx_ai_run_documents_run_type
  ON ai_run_documents(run_id, document_type, version DESC);

ALTER TABLE ai_run_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view ai run documents" ON ai_run_documents;
CREATE POLICY "Members can view ai run documents"
  ON ai_run_documents
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ai_runs run
    WHERE run.id = ai_run_documents.run_id
      AND is_org_member(run.org_id)
  ));

DROP POLICY IF EXISTS "Editors can manage ai run documents" ON ai_run_documents;
CREATE POLICY "Editors can manage ai run documents"
  ON ai_run_documents
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ai_runs run
    WHERE run.id = ai_run_documents.run_id
      AND can_edit_org(run.org_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ai_runs run
    WHERE run.id = ai_run_documents.run_id
      AND can_edit_org(run.org_id)
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_run_documents TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_run_approvals_one_create_drafts
  ON ai_run_approvals(run_id, approval_type)
  WHERE approval_type = 'create_drafts' AND status = 'approved';

CREATE OR REPLACE FUNCTION replace_ai_agent_workflow(
  p_org_id uuid,
  p_agent_slugs text[]
)
RETURNS SETOF ai_agent_workflow_steps
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT has_org_role(p_org_id, 'admin') THEN
    RAISE EXCEPTION 'Only workspace admins can change the AI agent workflow';
  END IF;

  IF COALESCE(array_length(p_agent_slugs, 1), 0) = 0 THEN
    RAISE EXCEPTION 'The workflow needs at least one agent';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_agent_slugs) slug
    WHERE NOT EXISTS (
      SELECT 1 FROM ai_agents agent
      WHERE agent.slug = slug
        AND agent.is_enabled = true
        AND (agent.org_id IS NULL OR agent.org_id = p_org_id)
    )
  ) THEN
    RAISE EXCEPTION 'The workflow contains an unavailable agent';
  END IF;

  DELETE FROM ai_agent_workflow_steps WHERE org_id = p_org_id;

  INSERT INTO ai_agent_workflow_steps (org_id, agent_slug, sort_order, created_by)
  SELECT p_org_id, ordered.slug, ordered.position - 1, auth.uid()
  FROM (
    SELECT slug, MIN(position)::integer AS position
    FROM unnest(p_agent_slugs) WITH ORDINALITY AS item(slug, position)
    WHERE NULLIF(btrim(slug), '') IS NOT NULL
    GROUP BY slug
  ) ordered
  ORDER BY ordered.position;

  RETURN QUERY
  SELECT step.*
  FROM ai_agent_workflow_steps step
  WHERE step.org_id = p_org_id
  ORDER BY step.sort_order;
END;
$$;

REVOKE ALL ON FUNCTION replace_ai_agent_workflow(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_ai_agent_workflow(uuid, text[]) TO authenticated;
