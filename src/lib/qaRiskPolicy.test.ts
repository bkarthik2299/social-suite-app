import { describe, expect, it } from 'vitest';

import { normalizeQaFindings } from '../../supabase/functions/_shared/agent_contracts';

describe('Mission QA risk policy', () => {
  it('treats illustrative cities, scenes, mood, and metaphors as optional notes', () => {
    const findings = normalizeQaFindings({
      findings: [
        {
          group: 'socialPosts',
          index: 0,
          category: 'creative_example',
          severity: 'blocking',
          problem: 'The imagined Paris street scene is not a verified brand fact.',
          suggestion: 'Use a generic setting.',
        },
        {
          group: 'socialAds',
          index: 1,
          category: 'creative_example',
          severity: 'warning',
          problem: 'The visual metaphor and calm morning mood are illustrative.',
          suggestion: 'Consider a literal product visual.',
        },
      ],
    });

    expect(findings.map((finding) => finding.severity)).toEqual(['note', 'note']);
  });

  it('corrects an overstated unsupported-claim category for an obviously illustrative example', () => {
    const [finding] = normalizeQaFindings({
      findings: [{
        group: 'socialPosts',
        index: 0,
        category: 'unsupported_claim',
        severity: 'blocking',
        problem: 'The caption says “Planning a trip to Paris?” This is an illustrative travel example, not a verified brand fact.',
        suggestion: 'Optionally make the setting generic.',
      }],
    });

    expect(finding).toMatchObject({ category: 'creative_example', severity: 'note' });
  });

  it('keeps true factual, contract, platform, brand, and CTA risks eligible for blocking', () => {
    const categories = [
      'deliverable_contract',
      'required_field',
      'unsupported_claim',
      'brand_or_product',
      'safety',
      'platform_limit',
      'cta',
    ];
    const findings = normalizeQaFindings({
      findings: categories.map((category, index) => ({
        group: 'googleAds',
        index,
        category,
        severity: 'blocking',
        problem: `True ${category} risk`,
        suggestion: 'Repair it.',
      })),
    });

    expect(findings.every((finding) => finding.severity === 'blocking')).toBe(true);
  });

  it('downgrades taste-based blockers even when the model omits a category', () => {
    const [finding] = normalizeQaFindings({
      findings: [{
        group: 'socialPosts',
        index: 0,
        severity: 'blocking',
        problem: 'The LinkedIn opening feels generic and could be more engaging.',
        suggestion: 'Use a sharper hook.',
      }],
    });

    expect(finding).toMatchObject({ category: 'polish', severity: 'note' });
  });

  it('recognizes a wrong CTA as a blocker without relying on model category output', () => {
    const [finding] = normalizeQaFindings({
      findings: [{
        group: 'socialAds',
        index: 0,
        severity: 'blocking',
        problem: 'The CTA uses Sign Up instead of the requested action.',
        suggestion: 'Use Contact Us.',
      }],
    });

    expect(finding).toMatchObject({ category: 'cta', severity: 'blocking' });
  });
});
