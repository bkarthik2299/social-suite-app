import { describe, expect, it } from 'vitest';
import type { CampaignPack } from '../../supabase/functions/_shared/campaign_pack';
import { applyContentPatches, buildCampaignCalendar, deterministicQualityFindings, repairCampaignPack } from '../../supabase/functions/_shared/campaign_workflow';
import { emptyBrandInstructions, fallbackCreativeDirection, fallbackPlannerOutput, normalizeCreativeDirection } from '../../supabase/functions/_shared/agent_contracts';

const pack = (): CampaignPack => ({
  strategy: { title: 'Campaign', summary: 'A useful campaign rationale with enough detail to be reviewed.', objectives: ['Book a call'], contentPillars: ['First impressions'] },
  socialPosts: [
    { name: 'Post one', topic: 'Booking', caption: 'Booking should feel easy before a patient arrives.', platforms: ['linkedin'] },
    { name: 'Post two', topic: 'Response', caption: 'A quick response creates a calmer first impression.', platforms: ['instagram'] },
  ],
  googleAds: [{ name: 'Search one', topic: 'Online booking', keywords: ['online appointment booking'], headlines: ['Better Online Booking'], descriptions: ['Make the first step easier.'] }],
  socialAds: [{ name: 'Paid one', topic: 'First impression', platform: 'facebook', primaryText: 'The experience starts online.', headline: 'Start before the visit', cta: 'contact_us' }],
  blogOutlines: [{ title: 'The digital waiting room', slug: 'digital-waiting-room', excerpt: 'A practical guide.', metaTitle: 'The digital waiting room', metaDescription: 'A practical guide.', keywords: ['dental'], outline: ['Why it matters'] }],
  calendar: [],
});

describe('campaign workflow helpers', () => {
  it('keeps fallback research specific to the client brief', () => {
    const planner = fallbackPlannerOutput(
      'Target independent dental practice owners in the United States. The tone should be smart, warm and slightly playful. The goal is to make practice owners book a discovery call. Please research recent patient expectations around online booking, response times and first impressions. Create 4 social posts and a 7-day content calendar. Do not invent statistics or promise guaranteed growth.',
      { projectName: 'BerryStudio', campaignName: '' },
    );
    expect(planner.researchQuery).toContain('patient expectations around online booking, response times and first impressions');
    expect(planner.internalBrief.audience).toBe('independent dental practice owners in the United States');
    expect(planner.internalBrief.desiredAction).toBe('Book a discovery call.');
    expect(planner.internalBrief.researchNeeded).toBe(true);
  });

  it('builds the requested number of dated entries from real generated assets', () => {
    const calendar = buildCampaignCalendar(pack(), 7, '2026-07-29');
    expect(calendar).toHaveLength(7);
    expect(calendar.slice(0, 5).map((item) => item.type)).toEqual(['socials', 'google-ad', 'meta-ad', 'blogs', 'socials']);
    expect(calendar[0]).toMatchObject({ title: 'Post one', date: '2026-07-29' });
    expect(calendar[6].date).toBe('2026-08-04');
  });

  it('keeps a useful creative direction when the strategist model times out', () => {
    const planner = fallbackPlannerOutput(
      'Target independent dental practice owners. The goal is to make practice owners book a discovery call. Create 4 social posts, 2 Google ads, 2 paid social ads, 1 blog and a 7-day content calendar. The rough line is “Your waiting room starts online”.',
      { projectName: 'BerryStudio', campaignName: '' },
    );
    const direction = fallbackCreativeDirection(planner);
    expect(direction.title).toBe('Your waiting room starts online');
    expect(direction.contentAngles.length).toBeGreaterThanOrEqual(5);
    expect(direction.strategy.contentPillars).toHaveLength(4);
    const partial = normalizeCreativeDirection({
      title: 'The Digital Front Door',
      strategy: { title: 'The Digital Front Door', summary: 'A focused strategy.' },
    }, direction);
    expect(partial.title).toBe('The Digital Front Door');
    expect(partial.contentAngles).toEqual(direction.contentAngles);
    expect(partial.platformGuidance).toEqual(direction.platformGuidance);
    expect(partial.strategy.contentPillars).toEqual(direction.strategy.contentPillars);
  });

  it('applies only allowlisted, item-level edits', () => {
    const result = applyContentPatches(pack(), [
      { group: 'socialPosts', index: 0, field: 'caption', value: 'A warmer opening.', reason: 'Tone' },
      { group: 'socialPosts', index: 0, field: 'scheduledDate', value: '2030-01-01', reason: 'Disallowed field' },
    ]);
    expect(result.socialPosts[0].caption).toBe('A warmer opening.');
    expect(result.socialPosts[0].scheduledDate).toBeUndefined();
    expect(result.socialPosts).toHaveLength(2);
  });

  it('flags prohibited wording without silently rewriting it', () => {
    const input = pack();
    input.socialPosts[0].caption = 'Transform your practice today.';
    const brand = { ...emptyBrandInstructions(), prohibitedTerms: ['transform your practice'] };
    expect(deterministicQualityFindings(input, brand)).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: 'socialPosts', index: 0, severity: 'blocking' }),
    ]));
  });

  it('repairs conflicting CTAs, unfinished ad lines, and awkward action phrases before final QA', () => {
    const input = pack();
    input.socialPosts[0].caption = 'Contact BerryStudio to book a demo.';
    input.socialPosts[1].caption = 'The online first impression matters. Contact BerryStudio.';
    input.googleAds[0].headlines = ['Book A Demo Today', 'Smoother booking, less', 'First impressions begin'];
    input.googleAds[0].descriptions = ['BerryStudio supports mobile-friendly booking, forms, and communication for dental'];
    input.blogOutlines[0].excerpt = 'Make the first impression calm, easy, and worth booking a discovery call around.';
    const brief = { desiredAction: 'Book a discovery call with BerryStudio.', keywordTargets: ['online appointment booking'], confirmedFacts: [] };

    expect(deterministicQualityFindings(input, emptyBrandInstructions(), brief)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'blocking', problem: expect.stringContaining('different conversion action') }),
      expect.objectContaining({ severity: 'blocking', problem: expect.stringContaining('unfinished phrase') }),
    ]));

    const repaired = repairCampaignPack(input, brief).pack;
    expect(repaired.socialPosts[0].caption).toMatch(/book a discovery call/i);
    expect(repaired.socialPosts[1].caption).toBe('The online first impression matters. Book a discovery call with BerryStudio.');
    expect(repaired.googleAds[0].headlines).toContain('Book a Discovery Call');
    expect(repaired.googleAds[0].headlines.length).toBeGreaterThanOrEqual(8);
    expect(repaired.googleAds[0].headlines).toEqual(expect.arrayContaining(['Book a Discovery Call', 'Make the Next Step Clear', 'Clearer Online Experience']));
    expect(repaired.googleAds[0].descriptions).toContain('BerryStudio supports mobile-friendly booking, forms, and communication.');
    expect(repaired.googleAds[0].descriptions.length).toBeGreaterThanOrEqual(2);
    expect(repaired.blogOutlines[0].excerpt).toBe('Make the first impression calm, easy, and simple to continue.');
    expect(deterministicQualityFindings(repaired, emptyBrandInstructions(), brief).filter((finding) => finding.severity === 'blocking')).toEqual([]);
  });

  it('flags weak keyword coverage in Google Search headlines', () => {
    const input = pack();
    input.googleAds[0] = {
      name: 'Search one',
      topic: 'online appointment booking',
      keywords: ['online appointment booking'],
      headlines: ['Learn More Today', 'See Helpful Details', 'Explore Your Options', 'Take The Next Step', 'Start Here Today', 'A Clearer Experience', 'Simple And Useful', 'Find Out More'],
      descriptions: ['Explore clear information and learn more today.', 'Review the details and take the next step when ready.'],
    };

    expect(deterministicQualityFindings(input, emptyBrandInstructions())).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: 'googleAds', severity: 'blocking', problem: expect.stringContaining('keyword group') }),
    ]));
  });

  it('preserves a client keyword list and repairs coverage without choosing one primary keyword', () => {
    const input = pack();
    input.googleAds[0] = {
      name: 'Search one',
      topic: 'Booking intent',
      keywords: [],
      headlines: ['Welcome Patients Before', 'BerryStudio for First', 'Learn More Today'],
      descriptions: ['Review clear information from the active campaign brief.'],
    };
    const brief = {
      desiredAction: 'Book a discovery call.',
      keywordTargets: ['online dental booking', 'dental appointment booking', 'book dentist online'],
      confirmedFacts: [],
    };

    const repaired = repairCampaignPack(input, brief).pack;
    expect(repaired.googleAds[0].keywords).toEqual(brief.keywordTargets);
    expect(repaired.googleAds[0].headlines).not.toEqual(expect.arrayContaining(['Welcome Patients Before', 'BerryStudio for First']));
    expect(JSON.stringify(repaired.googleAds[0])).not.toMatch(/active campaign brief|grounded in the active brief/i);
    for (const keyword of brief.keywordTargets) {
      expect([...repaired.googleAds[0].headlines, ...repaired.googleAds[0].descriptions].join(' ').toLowerCase()).toContain(keyword);
    }
    expect(deterministicQualityFindings(repaired, emptyBrandInstructions(), brief).filter((finding) => finding.severity === 'blocking')).toEqual([]);
  });

  it('extracts an exact multi-keyword list from a raw client brief', () => {
    const planner = fallbackPlannerOutput(
      'Create 2 Google ads. Keywords: online dental booking, dental appointment booking, and book dentist online.',
      { projectName: 'BerryStudio', campaignName: '' },
    );

    expect(planner.internalBrief.keywordTargets).toEqual([
      'online dental booking',
      'dental appointment booking',
      'book dentist online',
    ]);
  });

  it('blocks a client keyword that is dropped from all ad groups', () => {
    const input = pack();
    const brief = {
      desiredAction: 'Book a discovery call.',
      keywordTargets: ['online appointment booking', 'book dentist online'],
      confirmedFacts: [],
    };

    expect(deterministicQualityFindings(input, emptyBrandInstructions(), brief)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'blocking', problem: expect.stringContaining('dropped from the ad groups') }),
    ]));
  });

  it('blocks an unsupported time claim and a CTA placed inside a blog body heading', () => {
    const input = pack();
    input.blogOutlines[0].outline = ['Introduction', 'Book a discovery call before setup', 'Finish setup in under a minute', 'Conclusion'];
    const findings = deterministicQualityFindings(input, emptyBrandInstructions(), {
      desiredAction: 'Book a discovery call.',
      keywordTargets: [],
      confirmedFacts: [],
    });

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: 'blogOutlines', severity: 'blocking', problem: expect.stringContaining('body-section heading') }),
      expect.objectContaining({ group: 'blogOutlines', severity: 'blocking', problem: expect.stringContaining('time claim') }),
    ]));
  });
});
