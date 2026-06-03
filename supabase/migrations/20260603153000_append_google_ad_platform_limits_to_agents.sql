UPDATE ai_agents
SET skill_md = rtrim(skill_md) || E'

## Google Search Ad Compliance
These are hard platform limits for every Google Responsive Search Ad draft:
- Use no more than 15 headlines per ad.
- Keep every headline at 30 characters or fewer.
- Use no more than 4 descriptions per ad.
- Keep every description at 90 characters or fewer.
- Keep display path 1 and display path 2 at 15 characters or fewer each.
- Rewrite over-limit assets into shorter natural copy before passing the pack forward.
- Never leave character-limit cleanup for the user.'
WHERE slug IN ('copywriter', 'platform-specialist', 'qa')
  AND skill_md NOT ILIKE '%## Google Search Ad Compliance%';
