DROP POLICY IF EXISTS "Editors can delete ai runs" ON ai_runs;

CREATE POLICY "Editors can delete ai runs"
    ON ai_runs FOR DELETE
    USING (can_edit_org(org_id));
