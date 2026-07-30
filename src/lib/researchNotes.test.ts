import { describe, expect, it } from 'vitest';
import { formatResearchCampaignFocus, researchNoteFindings } from './researchNotes';

describe('research note findings', () => {
  it('formats campaign focus into readable labeled sections', () => {
    const formatted = formatResearchCampaignFocus('Verified context. Offering: South Indian snacks. Audience: Global diaspora. Desired action: Browse and buy products. Campaign plan: Use monsoon nostalgia. Keep the tone clear and warm. The output should avoid invented offers.â€¦');

    expect(formatted).toContain('Verified context.\n\nOffering: South Indian snacks.');
    expect(formatted).toContain('\n\nAudience: Global diaspora.');
    expect(formatted).toContain('\n\nDesired action: Browse and buy products.');
    expect(formatted).toContain('\n\nCampaign plan: Use monsoon nostalgia.');
    expect(formatted).toContain('\n\nTone: clear and warm.');
    expect(formatted).toContain('\n\nOutput requirements: The output should avoid invented offers.…');
    expect(formatted).not.toContain('â€¦');
  });

  it('uses the structured evidence brief without splitting a finding into bullets', () => {
    const findings = researchNoteFindings({
      findings: [{
        claim: 'Patients expect online booking to be easy to find.',
        sourceNumbers: [1, 2],
        confidence: 'high',
        publicUse: 'safe',
        campaignUse: 'Position booking as part of the first impression.',
      }],
    }, '');

    expect(findings).toEqual([{
      claim: 'Patients expect online booking to be easy to find.',
      sourceNumbers: [1, 2],
      confidence: 'high',
      publicUse: 'safe',
      campaignUse: 'Position booking as part of the first impression.',
    }]);
  });

  it('groups legacy numbered text into complete findings', () => {
    const findings = researchNoteFindings(null, [
      '1. Booking should be easy to find. Source numbers: 1, 2 Confidence: high; public use: safe Campaign use: Lead with clarity.',
      '2. Fast replies build trust. Source numbers: 3 Confidence: medium; public use: caution Campaign use: Keep the claim directional.',
    ].join('\n'));

    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      claim: 'Booking should be easy to find.',
      sourceNumbers: [1, 2],
      confidence: 'high',
      publicUse: 'safe',
      campaignUse: 'Lead with clarity.',
    });
  });
});
