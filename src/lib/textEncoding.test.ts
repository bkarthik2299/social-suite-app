import { describe, expect, it } from 'vitest';
import { normalizeCreativeDirection } from '../../supabase/functions/_shared/agent_contracts';
import { normalizeCampaignPack } from '../../supabase/functions/_shared/campaign_pack';
import { repairMojibake } from '../../supabase/functions/_shared/text_encoding';

describe('model output text encoding', () => {
  it('repairs mojibake punctuation while preserving valid Unicode', () => {
    expect(repairMojibake('Aptus â€” Home for All â€œtodayâ€')).toBe('Aptus — Home for All “today”');
    expect(repairMojibake('South India ❤️')).toBe('South India ❤️');
  });

  it('normalizes clean text in creative direction and the final campaign pack', () => {
    const fallback = {
      title: 'Fallback', centralIdea: 'Fallback', audienceProblem: 'Fallback', promise: 'Fallback',
      keyMessages: [], callsToAction: [], contentAngles: [], platformGuidance: {},
      strategy: { title: 'Fallback', summary: 'Fallback', objectives: [], contentPillars: [] },
    };
    expect(normalizeCreativeDirection({ title: 'Aptus â€” Home for All' }, fallback).title).toBe('Aptus — Home for All');
    expect(normalizeCampaignPack({ strategy: { title: 'Aptus â€” Home for All' } }).strategy.title).toBe('Aptus — Home for All');
  });
});
