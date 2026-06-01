import { describe, expect, it } from 'vitest';

import { normalizeBriefToCampaignArtifact } from './aiCampaignPack';

describe('normalizeBriefToCampaignArtifact', () => {
  it('normalizes snake_case AI output and nested calendar objects', () => {
    const pack = normalizeBriefToCampaignArtifact({
      campaign_name: 'Naruvi Free Preventive Checkup Launch',
      strategy: {
        objective: 'Drive awareness and appointments.',
        key_message: 'Preventive care helps people stay ahead.',
        content_pillars: ['Education', 'Trust'],
      },
      social_posts: [
        {
          headline: 'Your health is not waiting',
          body: 'Book a free preventive health checkup at Naruvi.',
          platform: 'Instagram',
          post_type: 'Carousel',
          visual_description: 'Clean teal carousel.',
        },
      ],
      google_ads: [
        {
          ad_type: 'Search Ad',
          headline_1: 'Free Health Checkup',
          headline_2: 'Naruvi Hospitals',
          description_1: 'Call 0416-666 1111 to book.',
          path_1: 'free-checkup',
        },
      ],
      paid_social_ads: [
        {
          platform: 'LinkedIn',
          headline: 'Free preventive checkup',
          body: 'For adults 25-40 in Vellore.',
          cta: 'Learn More',
        },
      ],
      blog_outlines: [
        {
          title: 'Why Adults 25-40 Need Preventive Checkups',
          sections: ['What is preventive care?', 'How to book'],
        },
      ],
      calendar: {
        week_1: {
          day_1: "Launch post: Instagram carousel 'Your health is not waiting'",
          day_4: 'Google Search Ad 1 live',
          day_7: 'Blog 1 published',
        },
      },
    });

    expect(pack.strategy?.title).toBe('Naruvi Free Preventive Checkup Launch');
    expect(pack.socialPosts).toHaveLength(1);
    expect(pack.googleAds[0].headlines).toContain('Free Health Checkup');
    expect(pack.socialAds).toHaveLength(1);
    expect(pack.blogOutlines[0].outline).toEqual(['What is preventive care?', 'How to book']);
    expect(pack.calendar).toHaveLength(3);
    expect(pack.calendar?.[1]).toMatchObject({ type: 'google-ad' });
    expect(pack.calendar?.[2]).toMatchObject({ type: 'blogs' });
  });

  it('moves past explicit calendar dates onto the current 30-day schedule', () => {
    const pack = normalizeBriefToCampaignArtifact({
      calendar: [
        { title: 'Past launch item', type: 'socials', date: '2025-04-01' },
        { title: 'Past ad item', type: 'google-ad', date: '2025-04-02' },
      ],
    });

    const today = localDateString(new Date());

    expect((pack.calendar?.[0].date || '') >= today).toBe(true);
    expect((pack.calendar?.[1].date || '') >= today).toBe(true);
  });
});

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
