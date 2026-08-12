WITH updated_humanizers AS (
  UPDATE public.ai_agents
  SET
    skill_md = replace(
      skill_md,
      E'\n\nAdapted from blader/humanizer (MIT): https://github.com/blader/humanizer',
      ''
    ),
    updated_at = now()
  WHERE slug = 'humanizer'
    AND skill_md LIKE '%Adapted from blader/humanizer%'
  RETURNING id, skill_md
)
INSERT INTO public.ai_agent_versions (agent_id, skill_md, change_note)
SELECT id, skill_md, 'Removed repository attribution from the Humanizer skill'
FROM updated_humanizers
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ai_agent_versions version
  WHERE version.agent_id = updated_humanizers.id
    AND version.skill_md = updated_humanizers.skill_md
);
