import { describe, expect, it } from 'vitest';

import { hasScheduledContent, onboardingStorageKey } from '@/lib/onboarding';

describe('onboarding helpers', () => {
  it('recognizes every date field used by calendar content', () => {
    expect(hasScheduledContent([{ payload: { scheduledDate: '2026-08-01' } }])).toBe(true);
    expect(hasScheduledContent([{ payload: { start_date: '2026-08-02' } }])).toBe(true);
    expect(hasScheduledContent([{ payload: { publishDate: '2026-08-03' } }])).toBe(true);
  });

  it('does not count empty or unrelated fields as scheduled content', () => {
    expect(hasScheduledContent([{ payload: { scheduledDate: '  ', title: 'Draft' } }, { payload: {} }])).toBe(false);
  });

  it('scopes browser state to the user, organization, and checklist version', () => {
    expect(onboardingStorageKey('seen', 'user-1', 'org-1')).toBe(
      'socialsuite.onboarding.v1.seen.user-1.org-1',
    );
  });
});
