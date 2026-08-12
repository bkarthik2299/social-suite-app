DO $$
DECLARE
  candidate record;
BEGIN
  FOR candidate IN
    SELECT agent.id, agent.org_id, agent.slug
    FROM public.ai_agents agent
    WHERE agent.org_id IS NOT NULL
      AND agent.slug <> 'humanizer'
      AND lower(btrim(agent.name)) IN ('humanizer', 'humanizer agent')
      AND NOT EXISTS (
        SELECT 1
        FROM public.ai_agents canonical
        WHERE canonical.org_id = agent.org_id
          AND canonical.slug = 'humanizer'
      )
  LOOP
    DELETE FROM public.ai_agent_workflow_steps existing
    WHERE existing.org_id = candidate.org_id
      AND existing.agent_slug = candidate.slug
      AND EXISTS (
        SELECT 1
        FROM public.ai_agent_workflow_steps canonical_step
        WHERE canonical_step.org_id = candidate.org_id
          AND canonical_step.agent_slug = 'humanizer'
      );

    UPDATE public.ai_agent_workflow_steps
    SET agent_slug = 'humanizer'
    WHERE org_id = candidate.org_id
      AND agent_slug = candidate.slug;

    UPDATE public.ai_agents
    SET
      slug = 'humanizer',
      description = 'Optionally makes eligible social and blog copy read more naturally before QA without editing Google Ads.',
      updated_at = now()
    WHERE id = candidate.id;
  END LOOP;
END;
$$;

UPDATE public.ai_agents
SET
  skill_md = replace(
    skill_md,
    'Run only when the user selects natural-language editing.',
    'Run only when this agent is added to the workspace workflow.'
  ),
  updated_at = now()
WHERE slug = 'humanizer'
  AND skill_md LIKE '%Run only when the user selects natural-language editing.%';
