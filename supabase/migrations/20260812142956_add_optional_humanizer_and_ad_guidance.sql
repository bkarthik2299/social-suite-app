-- Add the optional Humanizer and strengthen the two existing ideation/writing
-- agents with the most useful ad-creative principles. Platform limits remain
-- owned by Platform Specialist.

INSERT INTO public.ai_agents (
  slug,
  name,
  description,
  skill_md,
  tools,
  output_schema,
  permissions,
  is_default,
  is_enabled
)
VALUES (
  'humanizer',
  'Humanizer Agent',
  'Optionally makes eligible social and blog copy read more naturally before QA without editing Google Ads.',
  $skill$# Humanizer Agent

## Purpose
Run only when this agent is added to the workspace workflow. Make eligible copy feel written by a thoughtful person while preserving the brief, brand voice, facts, CTA, and platform structure.

## Eligible Copy
- Organic social captions.
- Paid-social primary text, headline, and description.
- Blog excerpts and individual outline entries.

Never edit Google Ads. Never edit strategy, metadata, names, topics, platforms, visual guides, URLs, dates, keywords, CTA enum fields, counts, or structure.

## Editorial Method
1. Detect filler, vague hype, canned transitions, repetitive sentence shapes, awkward formality, robotic vocabulary, and overly polished sameness.
2. Prefer concrete wording, clean direct phrasing, varied sentence rhythm, and natural contractions when the brand voice permits them.
3. Preserve useful personality, intentional quirks, and every piece of information in the original.
4. Audit the revision against the brief and brand voice before returning a focused edit. Leave natural copy unchanged.

## Guardrails
- Never invent or strengthen facts, proof, numbers, testimonials, offers, urgency, guarantees, or claims.
- Never weaken required qualifications, restrictions, reader-facing CTA language, or approved brand terminology.
- Return focused field-level changes only, never a rewritten campaign pack.$skill$,
  ARRAY['content_editor'],
  'content_patches',
  '{"can_write":false,"can_publish":false,"can_delete":false}'::jsonb,
  true,
  true
)
ON CONFLICT DO NOTHING;

UPDATE public.ai_agents
SET
  skill_md = skill_md || $addition$

## Advertising Angle Method
- Create 3 to 5 genuinely different advertising angles when the deliverable plan needs them; do not treat synonym swaps as new angles.
- Define each angle through the audience problem or tension, hook, grounded promise, visual direction, and a clear testing hypothesis.
- Use performance evidence to prioritize angles only when that evidence is actually provided. Never fabricate performance rationale.
$addition$,
  updated_at = now()
WHERE org_id IS NULL
  AND slug = 'creative-strategist'
  AND is_default = true
  AND skill_md NOT LIKE '%## Advertising Angle Method%';

UPDATE public.ai_agents
SET
  skill_md = skill_md || $addition$

## Ad Variation Discipline
- Map every requested asset to an assigned creative angle before writing it.
- Make variations meaningfully different in hook, framing, promise, or audience tension; do not submit synonym swaps.
- Keep one main angle, one grounded promise, and one requested next action per ad.
- Never invent proof, statistics, testimonials, urgency, guarantees, or performance claims.
- Leave platform field limits and placement-specific grammar to Platform Specialist.
$addition$,
  updated_at = now()
WHERE org_id IS NULL
  AND slug = 'copywriter'
  AND is_default = true
  AND skill_md NOT LIKE '%## Ad Variation Discipline%';

INSERT INTO public.ai_agent_versions (agent_id, skill_md, change_note)
SELECT agent.id, agent.skill_md,
  CASE agent.slug
    WHEN 'humanizer' THEN 'Added optional guarded Humanizer baseline'
    ELSE 'Added focused ad-angle and variation guidance adapted from ad-creative best practices'
  END
FROM public.ai_agents agent
WHERE agent.org_id IS NULL
  AND agent.slug IN ('humanizer', 'creative-strategist', 'copywriter')
  AND NOT EXISTS (
    SELECT 1
    FROM public.ai_agent_versions version
    WHERE version.agent_id = agent.id
      AND version.skill_md = agent.skill_md
  );
