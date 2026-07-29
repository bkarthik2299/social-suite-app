-- Replace the single-primary-keyword assumption with flexible keyword groups.
-- Update only Platform Specialist copies still carrying the previous built-in
-- Google Search section, and preserve independently customized skills.

WITH updated_platform_agents AS (
  UPDATE public.ai_agents
  SET
    description = 'Applies current channel structure, creative best practices, keyword-group rules, field limits, and placement fit to campaign content.',
    skill_md = replace(
      replace(
        replace(
          skill_md,
          $old$6. Use only confirmed facts. Never invent products, services, prices, promotions, availability, proof, people, results, urgency, keywords, or landing pages.$old$,
          $new$6. Use only confirmed facts. Never invent products, services, prices, promotions, availability, proof, people, results, urgency, or landing pages. When the client supplies no search terms, you may infer a small keyword list only from confirmed brief language.$new$
        ),
        $old$### Plan the Search Theme First
- Give each ad one tight ad-group theme and one primary keyword phrase that matches a real search intent.
- Use client-supplied keyword research when available. Otherwise derive a close, natural search phrase only from the confirmed product, service, subject, location, audience need, and research evidence.
- Store the primary keyword theme in the topic field so downstream checks can understand the intent.
- Separate materially different intents such as research, comparison, local service, price, brand, and urgent action. Do not mix unrelated keyword themes in one ad.
- Match the promise, terminology, CTA, paths, and final URL to the landing page supplied in the brief. Never create a URL or promise that the landing page may not support.$old$,
        $new$### Build the Keyword Plan
- Treat topic as a readable ad-group or search-intent label. Store the actual search terms in the keyword list; never force one primary keyword when the client supplied several.
- Client-supplied keywords always win. Preserve every term exactly, keep the original list available for review, and never silently drop, rewrite, or replace a term.
- Group only closely related terms that share the same search intent. Separate materially different intents such as research, comparison, local service, price, brand, and urgent action into different ads.
- When the client supplies no keywords, infer 1 to 5 close, natural search phrases only from the confirmed product, service, subject, location, audience need, and research evidence. Do not add a new service, claim, location, or offer through a keyword.
- Match the keyword group, promise, terminology, CTA, paths, and final URL to the landing page supplied in the brief. Never create a URL or promise that the landing page may not support.
- Before handoff, confirm that every client term appears in an ad's keyword list and in at least one headline or description. If a term cannot fit naturally within platform limits, keep it in the keyword list and flag it instead of hiding the conflict.$new$
      ),
      $old$- Put the exact primary keyword or its closest natural variant in at least 2 headlines. Keep the phrase inside one headline; do not split it across headlines.$old$,
      $new$- Use one or more assigned keywords, or close natural variants, in at least 2 headlines. Keep each phrase inside one headline; do not split it across headlines. Ensure every client-supplied term appears exactly in at least one headline or description.$new$
    ),
    updated_at = now()
  WHERE slug = 'platform-specialist'
    AND skill_md ILIKE '# Platform Specialist%'
    AND skill_md ILIKE '%### Plan the Search Theme First%'
    AND skill_md NOT ILIKE '%### Build the Keyword Plan%'
  RETURNING id, skill_md
)
INSERT INTO public.ai_agent_versions (agent_id, skill_md, change_note)
SELECT id, skill_md, 'Replaced the single primary keyword assumption with preserved, intent-grouped keyword lists.'
FROM updated_platform_agents;
