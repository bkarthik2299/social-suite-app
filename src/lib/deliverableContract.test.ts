import { describe, expect, it } from 'vitest';
import { extractDeliverableContract, resolveDeliverableContract } from '../../supabase/functions/_shared/deliverable_contract';

describe('deliverable contract extraction', () => {
  it('uses the default balanced pack when the brief has no explicit counts', () => {
    expect(extractDeliverableContract('Create a campaign for a new service launch')).toEqual({
      socialPosts: 12,
      googleAds: 3,
      socialAds: 4,
      blogOutlines: 2,
      calendarItems: 30,
      explicitCounts: false,
    });
  });

  it('extracts exact counts and zeros unspecified deliverable types', () => {
    expect(extractDeliverableContract('Need 3 social media posts, 2 social media ads, and 1 blog for this campaign')).toEqual({
      socialPosts: 3,
      googleAds: 0,
      socialAds: 2,
      blogOutlines: 1,
      calendarItems: 6,
      explicitCounts: true,
    });
  });

  it('keeps Google ads separate from paid social ads', () => {
    expect(extractDeliverableContract('Prepare 4 posts, 2 Google ads, 5 Meta ads, and 2 blogs')).toEqual({
      socialPosts: 4,
      googleAds: 2,
      socialAds: 5,
      blogOutlines: 2,
      calendarItems: 13,
      explicitCounts: true,
    });
  });

  it('lets deterministic brief counts override a model-suggested contract', () => {
    const fallback = extractDeliverableContract('Make a normal campaign');
    expect(resolveDeliverableContract('Create 2 social posts', {
      explicitCounts: true,
      socialPosts: 12,
      googleAds: 3,
      socialAds: 4,
      blogOutlines: 2,
      calendarItems: 30,
    }, fallback)).toMatchObject({
      socialPosts: 2,
      googleAds: 0,
      socialAds: 0,
      blogOutlines: 0,
      calendarItems: 2,
      explicitCounts: true,
    });
  });
});
