import { describe, expect, it } from 'vitest';
import { researchNoteFindings } from './researchNotes';

describe('research note findings', () => {
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
