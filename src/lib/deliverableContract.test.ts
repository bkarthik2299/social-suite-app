import { describe, expect, it } from 'vitest';
import { extractDeliverableContract, extractRequestedChannelConstraints, requestedChannelLabels, resolveDeliverableContract } from '../../supabase/functions/_shared/deliverable_contract';

describe('deliverable contract extraction', () => {
  it('uses a focused default pack when the brief has no explicit counts', () => {
    expect(extractDeliverableContract('Create a campaign for a new service launch')).toEqual({
      socialPosts: 4,
      googleAds: 2,
      socialAds: 2,
      blogOutlines: 1,
      calendarItems: 9,
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

  it('understands paid-platform phrasing and ignores explicitly excluded outputs', () => {
    const prompt = 'Create 2 organic Instagram posts and 1 paid Instagram ad. No Google ads and no blog.';

    expect(extractDeliverableContract(prompt)).toEqual({
      socialPosts: 2,
      googleAds: 0,
      socialAds: 1,
      blogOutlines: 0,
      calendarItems: 3,
      explicitCounts: true,
    });
    expect(requestedChannelLabels(prompt)).toEqual([
      'Instagram organic posts',
      'Instagram paid ads',
    ]);
  });

  it('understands platform-before-paid phrasing from natural briefs', () => {
    const prompt = 'Create exactly 1 Instagram post, 1 Facebook paid ad, 1 Google Search ad, and 1 blog outline.';

    expect(extractDeliverableContract(prompt)).toEqual({
      socialPosts: 1,
      googleAds: 1,
      socialAds: 1,
      blogOutlines: 1,
      calendarItems: 4,
      explicitCounts: true,
    });
    expect(requestedChannelLabels(prompt)).toEqual([
      'Instagram organic posts',
      'Facebook paid ads',
      'Google Search ads',
      'blog',
    ]);
  });

  it('honors an explicitly requested day count for the calendar', () => {
    expect(extractDeliverableContract('Create 4 posts, 2 Google ads, 2 paid social ads, 1 blog and a 7-day content calendar')).toEqual({
      socialPosts: 4,
      googleAds: 2,
      socialAds: 2,
      blogOutlines: 1,
      calendarItems: 7,
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

  it('uses only the deliverable types named in the Berry Studio prompt and keeps their counts flexible', () => {
    const prompt = 'i want some creative and funny social media campaign with some insta posts, facebook ads and some google ads to promote the berrystudio app';

    expect(extractDeliverableContract(prompt)).toEqual({
      socialPosts: 4,
      googleAds: 2,
      socialAds: 2,
      blogOutlines: 0,
      calendarItems: 8,
      explicitCounts: false,
    });
    expect(extractRequestedChannelConstraints(prompt)).toEqual({
      organicSocial: ['instagram'],
      paidSocial: ['facebook'],
    });
    expect(requestedChannelLabels(prompt)).toEqual([
      'Instagram organic posts',
      'Facebook paid ads',
      'Google Search ads',
    ]);
  });
});
