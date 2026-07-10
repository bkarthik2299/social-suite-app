import { describe, expect, it } from 'vitest';

import {
  campaignTopic,
  safeBlogOutline,
  safeCalendarItem,
  safeGoogleAd,
  safeSocialAd,
  safeSocialPost,
  safeStrategy,
} from '../../supabase/functions/_shared/campaign_recovery';

function recoverySample(prompt: string) {
  const topic = campaignTopic(prompt);
  return {
    topic,
    strategy: safeStrategy(prompt, topic),
    socialPost: safeSocialPost(0, topic),
    googleAd: safeGoogleAd(0, topic),
    socialAd: safeSocialAd(0, topic),
    blog: safeBlogOutline(0, topic),
    calendar: safeCalendarItem(0, topic),
  };
}

describe('campaign recovery isolation', () => {
  it('grounds recovery content in a Duolingo brief without leaking another project domain', () => {
    const sample = recoverySample('Give me a comprehensive campaign to promote learning Spanish in India using Duolingo.');
    const serialized = JSON.stringify(sample);

    expect(sample.topic).toMatch(/Spanish/i);
    expect(serialized).toMatch(/Duolingo/i);
    expect(serialized).not.toMatch(/storm|restoration|contractor|invoice readiness|Naruvi|clinical wellness/i);
  });

  it('uses the active SaaS brief as the sole source for generic QA repairs', () => {
    const sample = recoverySample('Create a launch campaign for Orbit, a scheduling SaaS for independent fitness coaches.');
    const serialized = JSON.stringify(sample);

    expect(serialized).toMatch(/Orbit/i);
    expect(serialized).toMatch(/fitness coaches/i);
    expect(serialized).not.toMatch(/storm|restoration|hospital|patient|Naruvi|KYRO/i);
  });

  it('does not force healthcare language into non-healthcare recovery content', () => {
    const sample = recoverySample('Promote a summer menu for Cedar Cafe to remote workers in Bengaluru.');
    const serialized = JSON.stringify(sample);

    expect(serialized).toMatch(/Cedar Cafe/i);
    expect(serialized).toMatch(/remote workers/i);
    expect(serialized).not.toMatch(/health awareness|clinical|patient|hospital|storm|restoration/i);
  });
});
