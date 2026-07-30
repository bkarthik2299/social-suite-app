import { describe, expect, it } from 'vitest';
import type { CampaignPack } from '../../supabase/functions/_shared/campaign_pack';
import {
  alignCampaignPackToRequestedPlatforms,
  applyContentPatches,
  buildCampaignCalendar,
  campaignCalendarCount,
  campaignSectionMinimumCount,
  campaignSectionValidationError,
  deterministicQualityFindings,
  limitCampaignPackToContract,
  repairCampaignPack,
} from '../../supabase/functions/_shared/campaign_workflow';
import { emptyBrandInstructions, fallbackCreativeDirection, fallbackPlannerOutput, normalizeCreativeDirection, requirePlannerResearch } from '../../supabase/functions/_shared/agent_contracts';

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

  it('passes the Berry Studio prompt deliverables and named platforms through the planner handoff', () => {
    const planner = fallbackPlannerOutput(
      'i want some creative and funny social media campaign with some insta posts, facebook ads and some google ads to promote the berrystudio app',
      { projectName: 'BerryStudio', campaignName: '' },
    );

    expect(planner.deliverableContract).toMatchObject({
      socialPosts: 4,
      googleAds: 2,
      socialAds: 2,
      blogOutlines: 0,
      explicitCounts: false,
    });
    expect(planner.internalBrief.requestedChannels).toEqual([
      'Instagram organic posts',
      'Facebook paid ads',
      'Google Search ads',
    ]);
  });

  it('forces a source-ready research question for Deep Work even when the brief does not request research', () => {
    const prompt = 'i want some creative and funny social media campaign with some insta posts, facebook ads and some google ads to promote the berrystudio app';
    const destination = { projectName: 'Berry Studio AI', campaignName: '' };
    const planner = fallbackPlannerOutput(prompt, destination);

    expect(planner.internalBrief.researchNeeded).toBe(false);
    const deepPlanner = requirePlannerResearch({ ...planner, researchQuery: '' }, prompt, destination);
    expect(deepPlanner.internalBrief.researchNeeded).toBe(true);
    expect(deepPlanner.researchQuery).toBe('What recent audience evidence and channel behavior can responsibly improve this campaign for Berry Studio AI?');
  });

  it('builds the requested number of dated entries from real generated assets', () => {
    const calendar = buildCampaignCalendar(pack(), 7, '2026-07-29');
    expect(calendar).toHaveLength(7);
    expect(calendar.slice(0, 5).map((item) => item.type)).toEqual(['socials', 'google-ad', 'meta-ad', 'blogs', 'socials']);
    expect(calendar[0]).toMatchObject({ title: 'Post one', date: '2026-07-29' });
    expect(calendar[6].date).toBe('2026-08-04');
  });

  it('accepts and trims model over-delivery instead of failing the entire campaign', () => {
    const input = pack();
    input.socialPosts = Array.from({ length: 15 }, (_, index) => ({
      name: `Post ${index + 1}`,
      topic: `Angle ${index + 1}`,
      caption: `Publishable caption ${index + 1}`,
      platforms: ['linkedin'],
    }));
    const contract = {
      socialPosts: 12,
      googleAds: 1,
      socialAds: 1,
      blogOutlines: 1,
      calendarItems: 12,
      explicitCounts: true,
    };

    expect(campaignSectionValidationError({ socialPosts: input.socialPosts }, 'socialPosts', 12)).toBeNull();
    expect(limitCampaignPackToContract(input, contract).socialPosts).toHaveLength(12);
  });

  it('rejects model under-delivery early so the next model can retry the section', () => {
    const socialPosts = Array.from({ length: 11 }, (_, index) => ({
      caption: `Publishable caption ${index + 1}`,
      platforms: ['instagram'],
    }));

    expect(campaignSectionValidationError({ socialPosts }, 'socialPosts', 12))
      .toBe('Expected at least 12 social posts but generated 11.');
  });

  it('treats qualitative counts as flexible while enforcing requested Instagram and Facebook channel mapping', () => {
    const contract = {
      socialPosts: 4,
      googleAds: 2,
      socialAds: 2,
      blogOutlines: 0,
      calendarItems: 8,
      explicitCounts: false,
    };
    const input = pack();
    input.socialPosts = [input.socialPosts[0]];
    input.socialPosts[0].creativeBrief = 'Turn the Facebook ad and Google Search ad angles into one organic idea.';
    input.socialPosts[0].visualGuide = 'Responsive search ad companion visual with a clean phone mockup.';
    input.googleAds = [input.googleAds[0]];
    input.socialAds = [{ ...input.socialAds[0], platform: 'instagram' }];
    input.blogOutlines = [];
    const prompt = 'i want some creative and funny social media campaign with some insta posts, facebook ads and some google ads to promote the berrystudio app';

    expect(campaignSectionMinimumCount(contract, 'socialPosts')).toBe(1);
    expect(campaignSectionMinimumCount(contract, 'googleAds')).toBe(1);
    expect(campaignSectionMinimumCount(contract, 'socialAds')).toBe(1);
    expect(campaignSectionMinimumCount(contract, 'blogOutlines')).toBe(0);
    expect(campaignCalendarCount(input, contract)).toBe(3);
    expect(campaignSectionValidationError({ socialPosts: input.socialPosts }, 'socialPosts', campaignSectionMinimumCount(contract, 'socialPosts'))).toBeNull();

    const aligned = alignCampaignPackToRequestedPlatforms(input, prompt);
    expect(aligned.socialPosts[0].platforms).toEqual(['instagram']);
    expect(aligned.socialPosts[0].creativeBrief).toBe('Turn the Instagram post and Instagram post angles into one organic idea.');
    expect(aligned.socialPosts[0].visualGuide).toBe('Instagram post companion visual with a clean phone mockup.');
    expect(aligned.socialAds[0].platform).toBe('facebook');
    expect(aligned.blogOutlines).toEqual([]);
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
