import { describe, expect, it } from 'vitest';
import type { CampaignPack } from '../../supabase/functions/_shared/campaign_pack';
import {
  alignCampaignPackToRequestedPlatforms,
  applyContentPatches,
  buildCampaignCalendar,
  campaignCalendarCount,
  campaignPlatformConsistencyFindings,
  campaignSectionMinimumCount,
  campaignSectionValidationError,
  deterministicQualityFindings,
  limitCampaignPackToContract,
  repairCampaignPack,
  reviewFindingResolvedByPatches,
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
  it('recognizes a patched LinkedIn opening and CTA as resolving the item-level QA finding', () => {
    const finding = {
      group: 'socialPosts' as const,
      index: 0,
      severity: 'blocking' as const,
      problem: 'The LinkedIn post is too broad in its opening and needs a professional insight before the CTA.',
      suggestion: 'Revise the opening while keeping the CTA.',
    };
    expect(reviewFindingResolvedByPatches(finding, [{
      group: 'socialPosts',
      index: 0,
      field: 'caption',
      value: 'A revised construction-management opening. Request a demo.',
      reason: 'Strengthens platform relevance.',
    }])).toBe(true);
    expect(reviewFindingResolvedByPatches({ ...finding, group: 'socialAds' }, [{
      group: 'socialAds',
      index: 0,
      field: 'visualGuide',
      value: 'Use a jobsite image.',
      reason: 'Adds visual direction.',
    }])).toBe(false);
  });

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
    input.socialPosts[0].name = 'Facebook Paid Ad 1';
    input.socialPosts[0].topic = 'Google Search ad';
    input.socialPosts[0].caption = 'Use this Google Search ad to reach the audience.';
    input.socialPosts[0].creativeBrief = 'Turn the Facebook ad and Google Search ad angles into one organic idea.';
    input.socialPosts[0].visualGuide = 'Responsive search ad companion visual; Facebook-friendly phone mockup.';
    input.googleAds = [input.googleAds[0]];
    input.socialAds = [{
      ...input.socialAds[0],
      platform: 'instagram',
      visualGuide: 'N/A for search ad; if used in asset extensions, keep the image clean.',
    }];
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
    expect(aligned.socialPosts[0].name).toBe('Instagram post 1');
    expect(aligned.socialPosts[0].topic).toBe('Instagram organic post');
    expect(aligned.socialPosts[0].caption).toBe('Use this Instagram post to reach the audience.');
    expect(aligned.socialPosts[0].creativeBrief).toBe('Turn the Instagram post and Instagram post angles into one organic idea.');
    expect(aligned.socialPosts[0].visualGuide).toBe('Instagram post companion visual; Instagram-friendly phone mockup.');
    expect(aligned.socialAds[0].platform).toBe('facebook');
    expect(aligned.socialAds[0].visualGuide).toContain('Facebook feed');
    expect(aligned.socialAds[0].visualGuide).not.toMatch(/search ad|asset extensions/i);
    expect(aligned.blogOutlines).toEqual([]);
    expect(campaignPlatformConsistencyFindings(aligned, prompt)).toEqual([]);

    const contradictory = pack();
    contradictory.socialPosts = [{
      ...contradictory.socialPosts[0],
      topic: 'Google Search ad',
      platforms: ['instagram'],
      creativeBrief: 'Write this as a Facebook organic post.',
    }];
    expect(campaignPlatformConsistencyFindings(contradictory, prompt)).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: 'socialPosts', severity: 'blocking' }),
    ]));

    contradictory.socialAds[0] = {
      ...contradictory.socialAds[0],
      platform: 'facebook',
      visualGuide: 'N/A for search ad; use this in asset extensions.',
    };
    expect(campaignPlatformConsistencyFindings(contradictory, prompt)).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: 'socialAds', severity: 'blocking' }),
    ]));
  });

  it('treats Twitter and X as the same platform in organic and paid metadata', () => {
    const input = pack();
    input.socialPosts = [{
      name: 'X/Twitter monsoon memory',
      topic: 'Twitter organic post',
      caption: 'A rainy-day snack memory worth sharing.',
      platforms: ['twitter'],
      creativeBrief: 'Write a concise X/Twitter post.',
    }];
    input.socialAds = [{
      name: 'X/Twitter monsoon ad',
      topic: 'Twitter paid social',
      platform: 'twitter',
      primaryText: 'Bring rainy-day snack memories home.',
      headline: 'Monsoon snacks',
      cta: 'shop_now',
    }];

    expect(campaignPlatformConsistencyFindings(input, 'Create Twitter posts and Twitter ads.')).toEqual([]);
  });

  it('keeps a useful creative direction when the strategist model times out', () => {
    const planner = fallbackPlannerOutput(
      'Target independent dental practice owners. The goal is to make practice owners book a discovery call. Create 4 social posts, 2 Google ads, 2 paid social ads, 1 blog and a 7-day content calendar. The rough line is “Your waiting room starts online”.',
      { projectName: 'BerryStudio', campaignName: '' },
    );
    const direction = fallbackCreativeDirection(planner);
    expect(direction.title).toBe('Your waiting room starts online');
    expect(direction.contentAngles.length).toBeGreaterThanOrEqual(5);
    expect(direction.contentAngles.join(' ')).toContain('independent dental practice owners');
    expect(direction.contentAngles.join(' ')).not.toContain('First impression: show the moments');
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

  it('matches prohibited terms as whole words instead of substrings', () => {
    const brand = { ...emptyBrandInstructions(), prohibitedTerms: ['date'] };
    const input = pack();
    input.socialPosts[0].caption = 'Project updates should be easier to review.';
    expect(deterministicQualityFindings(input, brand)).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ problem: expect.stringContaining('prohibited brand wording: date') }),
    ]));
    input.socialPosts[0].caption = 'Do not publish a date before it is confirmed.';
    expect(deterministicQualityFindings(input, brand)).toEqual(expect.arrayContaining([
      expect.objectContaining({ problem: expect.stringContaining('prohibited brand wording: date') }),
    ]));
  });

  it('flags genuinely duplicated copy without warning on normal cross-channel brand overlap', () => {
    const input = pack();
    input.socialPosts[1].caption = input.socialPosts[0].caption;
    expect(deterministicQualityFindings(input, emptyBrandInstructions())).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: 'socialPosts', index: 1, severity: 'warning', problem: expect.stringContaining('100% word overlap') }),
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

  it('accepts complete Google ad CTAs while identifying the exact unfinished headline', () => {
    const input = pack();
    input.googleAds[0].headlines = ['Learn More', 'Explore More', 'Designed for'];

    const findings = deterministicQualityFindings(input, emptyBrandInstructions());
    const unfinished = findings.filter((finding) => finding.problem.includes('unfinished phrase'));

    expect(unfinished).toHaveLength(1);
    expect(unfinished[0]).toMatchObject({
      group: 'googleAds',
      index: 0,
      severity: 'blocking',
      problem: 'Google ad headline 3 ("Designed for") ends as an unfinished phrase.',
    });
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

  it('removes generic conversion actions from inferred Google keyword lists', () => {
    const input = pack();
    input.googleAds[0].keywords = ['Book a Demo', 'orthodontic practice software'];
    input.googleAds[0].topic = 'orthodontic practice software';

    expect(deterministicQualityFindings(input, emptyBrandInstructions())).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: 'googleAds', severity: 'blocking', problem: expect.stringContaining('CTA text') }),
    ]));

    const repaired = repairCampaignPack(input, {
      desiredAction: 'Book a Demo',
      keywordTargets: [],
      confirmedFacts: [],
    }).pack;
    expect(repaired.googleAds[0].keywords).toEqual(['orthodontic practice software']);
  });

  it('removes unsupported audience-attribution framing before final QA', () => {
    const input = pack();
    input.socialAds[0].primaryText = 'Practice managers and clinic owners tell us the same thing: too much time is lost to admin.';

    expect(deterministicQualityFindings(input, emptyBrandInstructions())).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: 'socialAds', severity: 'blocking', problem: expect.stringContaining('unsupported customer') }),
    ]));

    const repaired = repairCampaignPack(input, {
      desiredAction: 'Book a Demo',
      keywordTargets: [],
      confirmedFacts: [],
    }).pack;
    expect(repaired.socialAds[0].primaryText).toBe('Too much time is lost to admin.');
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
