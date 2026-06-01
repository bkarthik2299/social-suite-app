CREATE TABLE IF NOT EXISTS ai_agent_workflow_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_slug text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (org_id, agent_slug)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_workflow_steps_org_order
    ON ai_agent_workflow_steps(org_id, sort_order);

ALTER TABLE ai_agent_workflow_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view workspace ai workflow"
    ON ai_agent_workflow_steps
    FOR SELECT
    TO authenticated
    USING (is_org_member(org_id));

CREATE POLICY "Admins can manage workspace ai workflow"
    ON ai_agent_workflow_steps
    FOR ALL
    TO authenticated
    USING (has_org_role(org_id, 'admin'))
    WITH CHECK (has_org_role(org_id, 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_agent_workflow_steps TO authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
        DROP TRIGGER IF EXISTS set_updated_at ON ai_agent_workflow_steps;
        CREATE TRIGGER set_updated_at
            BEFORE UPDATE ON ai_agent_workflow_steps
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;
