import { describe, expect, it } from 'vitest';
import { AI_CREDIT_PLANS, aiCreditCost, aiCreditProgress } from './aiCredits';

describe('AI credit plans', () => {
  it('matches the Growth, Scale, and Agency Pro allowances', () => {
    expect(AI_CREDIT_PLANS).toEqual({
      growth: { label: 'Growth', allowance: 200 },
      scale: { label: 'Scale', allowance: 600 },
      agency_pro: { label: 'Agency Pro', allowance: 1500 },
    });
  });

  it('charges one credit for Instant and image generation, and two for Deep Work', () => {
    expect(aiCreditCost('instant')).toBe(1);
    expect(aiCreditCost('deep')).toBe(2);
    expect(aiCreditCost('image')).toBe(1);
  });

  it('keeps the visual progress within zero and one hundred percent', () => {
    expect(aiCreditProgress(100, 200)).toBe(50);
    expect(aiCreditProgress(-1, 200)).toBe(0);
    expect(aiCreditProgress(250, 200)).toBe(100);
    expect(aiCreditProgress(0, 0)).toBe(0);
  });
});
