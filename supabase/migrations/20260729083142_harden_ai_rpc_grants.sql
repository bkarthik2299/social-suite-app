REVOKE ALL ON FUNCTION replace_ai_agent_workflow(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION replace_ai_agent_workflow(uuid, text[]) TO authenticated;

REVOKE ALL ON FUNCTION commit_ai_campaign_drafts(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION commit_ai_campaign_drafts(uuid, uuid, jsonb) TO authenticated;
