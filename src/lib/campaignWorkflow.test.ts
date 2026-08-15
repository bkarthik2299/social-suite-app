import { describe, expect, it } from 'vitest';
import type { CampaignPack } from '../../supabase/functions/_shared/campaign_pack';
import {
  alignCampaignPackToRequestedPlatforms,
  applicableContentPatches,
  applicableHumanizerPatches,
  applyContentPatches,
  buildCampaignCalendar,
  campaignCalendarCount,
  campaignPlatformConsistencyFindings,
  campaignSectionMinimumCount,
  campaignSectionVisualGuidanceError,
  campaignSectionValidationError,
  deterministicQualityFindings,
  expectedSocialAdCta,
  limitCampaignPackToContract,
  repairCampaignPack,
  repairCampaignSectionCount,
  repairCampaignSectionVisualGuidance,
  reviewFindingResolvedByPatches,
  reviewFindingFlagsValidSocialAdCta,
} from '../../supabase/functions/_shared/campaign_workflow';
import { emptyBrandInstructions, fallbackCreativeDirection, fallbackPlannerOutput, normalizeCreativeDirection, normalizeQaFindings, requirePlannerResearch } from '../../supabase/functions/_shared/agent_contracts';

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
  it('repairs an underfilled exact-count section before fatal validation', () => {
    const input = { socialPosts: pack().socialPosts.slice(0, 1) };
    const repaired = repairCampaignSectionCount(
      input,
      'socialPosts',
      8,
      'Create exactly 8 social posts for Switch Mobility.',
    );

    expect(campaignSectionValidationError(repaired, 'socialPosts', 8)).toBeNull();
    expect((repaired as { socialPosts: unknown[] }).socialPosts).toHaveLength(8);
  });

  it('requires social visual guides to be complete production briefs', () => {
    const incomplete = {
      socialPosts: [{
        name: 'Aptus eligibility post',
        topic: 'Self-employed eligibility',
        caption: 'A useful caption.',
        platforms: ['instagram'],
        visualGuide: 'Candid golden-hour photo of a shopkeeper with navy brand treatment.',
      }],
    };
    expect(campaignSectionVisualGuidanceError(incomplete, 'socialPosts')).toContain('image-prompt-style');

    const complete = {
      socialPosts: [{
        ...incomplete.socialPosts[0],
        visualGuide: 'Format & placement: Instagram four-slide carousel. Content concept: explain how self-employed income can be presented clearly. Layout: slide 1 is the myth, slides 2 and 3 clarify the idea, slide 4 gives the next step. On-creative copy: “Income is more than a payslip.” Brand execution: use the verified navy palette, approved type, and subtle line motif. Production notes: 4:5 crop, safe margins, large accessible type, and strong contrast.',
      }],
    };
    expect(campaignSectionVisualGuidanceError(complete, 'socialPosts')).toBeNull();
  });

  it('rejects substantially repeated visual concepts within one social section', () => {
    const guide = 'Format & placement: Facebook single-image feed post. Content concept: show a family approaching a warm home at dusk. Layout: family centered below a short headline zone. On-creative copy: “A place to belong.” Brand execution: use verified navy with the approved white line motif. Production notes: 4:5 crop, safe margins, accessible contrast.';
    const input = {
      socialPosts: [
        { name: 'One', topic: 'Belonging', caption: 'First caption.', platforms: ['facebook'], visualGuide: guide },
        { name: 'Two', topic: 'Trust', caption: 'Second caption.', platforms: ['facebook'], visualGuide: guide },
      ],
    };
    expect(campaignSectionVisualGuidanceError(input, 'socialPosts')).toContain('repeat substantially');
  });

  it('requires explanatory social formats for eligibility and process content', () => {
    const input = {
      socialPosts: [{
        name: 'Eligibility explained',
        topic: 'Home loan eligibility tips',
        caption: 'Understand which documents can help explain self-employed income.',
        platforms: ['instagram'],
        visualGuide: 'Format & placement: Instagram single-image feed post. Content concept: a shopkeeper at work. Layout: full-bleed photograph with the subject centered. On-creative copy: No overlay text. Brand execution: verified navy palette and approved logo. Production notes: 4:5 crop, safe margins, and accessible contrast.',
      }],
    };
    expect(campaignSectionVisualGuidanceError(input, 'socialPosts')).toContain('explanatory social format');
  });

  it('repairs practical social visual guides into explanatory formats', () => {
    const input = {
      socialPosts: [{
        name: 'Execution checklist',
        topic: 'Daily task process tips',
        caption: 'See the steps that help a team keep daily execution on track.',
        platforms: ['linkedin'],
        visualGuide: 'Format & placement: LinkedIn single-image feed post. Content concept: a smiling team in an office. Layout: full-bleed photograph with the subject centered. On-creative copy: No overlay text. Brand execution: verified purple palette and approved logo. Production notes: 4:5 crop, safe margins, and accessible contrast.',
      }],
    };
    const repaired = repairCampaignSectionVisualGuidance(input, 'socialPosts');

    expect(campaignSectionVisualGuidanceError(repaired, 'socialPosts')).toBeNull();
    expect(JSON.stringify(repaired)).toContain('four-slide carousel');
  });

  it('repairs a full practical social set without repeated visual failures', () => {
    const input = {
      socialPosts: [
        {
          name: 'Daily execution gap',
          topic: 'Manual task process',
          caption: 'A simple workflow helps the team see what needs action before anything falls through.',
          platforms: ['linkedin'],
          visualGuide: 'Format & placement: LinkedIn single-image post. Content concept: a team in a clinic. Layout: full-bleed photo. On-creative copy: No overlay. Brand execution: use brand colors. Production notes: 4:5 crop.',
        },
        {
          name: 'Task handoff guide',
          topic: 'Team handoff steps',
          caption: 'Turn every follow-up into a visible next step that the right person can own.',
          platforms: ['instagram'],
          visualGuide: 'Format & placement: Instagram single-image post. Content concept: a laptop on a desk. Layout: centered photo. On-creative copy: No overlay. Brand execution: use brand colors. Production notes: square crop.',
        },
        {
          name: 'Tracking tips',
          topic: 'Task tracking tips',
          caption: 'When the task list is clear, the day feels calmer for the whole practice team.',
          platforms: ['facebook'],
          visualGuide: 'Format & placement: Facebook single-image post. Content concept: smiling staff. Layout: photo background. On-creative copy: No overlay. Brand execution: use brand colors. Production notes: square crop.',
        },
        {
          name: 'Follow-up checklist',
          topic: 'Patient follow-up checklist',
          caption: 'Use BerryTasks to keep follow-ups visible from intake to the next action.',
          platforms: ['linkedin'],
          visualGuide: 'Format & placement: LinkedIn single-image post. Content concept: office photograph. Layout: lower-third text band. On-creative copy: Follow up clearly. Brand execution: use brand colors. Production notes: 4:5 crop.',
        },
      ],
    };
    const repaired = repairCampaignSectionVisualGuidance(input, 'socialPosts');

    expect(campaignSectionVisualGuidanceError(repaired, 'socialPosts')).toBeNull();
    expect(JSON.stringify(repaired)).toContain('document post');
  });

  it('repairs eight social posts into distinct visual structures', () => {
    const socialPosts = Array.from({ length: 8 }, (_, index) => ({
      name: `Switch post ${index + 1}`,
      topic: `Zero-emission mobility angle ${index + 1}`,
      caption: `A distinct campaign message for fleet and transport buyers ${index + 1}.`,
      platforms: ['linkedin'],
      visualGuide: 'Format & placement: LinkedIn single-image post. Content concept: an electric vehicle on a city road. Layout: full-bleed photograph with a lower-third headline. On-creative copy: Move forward. Brand execution: use verified brand colors and logo. Production notes: export at 4:5 with safe margins.',
    }));

    const repaired = repairCampaignSectionVisualGuidance({ socialPosts }, 'socialPosts');

    expect(campaignSectionVisualGuidanceError(repaired, 'socialPosts')).toBeNull();
    expect(JSON.stringify(repaired)).toContain('myth-versus-fact carousel');
  });

  it('rejects different ad subjects placed into the same finished template', () => {
    const sharedStructure = (concept: string, hook: string) => `Format & placement: Instagram feed single-image ad, 1:1 aspect ratio. Content concept: ${concept}. Layout: Full-bleed photograph with a navy duotone. Put the headline in the lower third on a blue band and the logo in the top-left. On-creative copy: ${hook}. Brand execution: verified navy palette and approved wordmark. Production notes: Export at 1080x1080. Keep text and logo in safe zones and preserve high contrast.`;
    const input = {
      socialAds: [
        { name: 'Artisan ad', topic: 'Self-employed applicants', platform: 'instagram', primaryText: 'Built around your work.', headline: 'A loan that understands', cta: 'contact_us', visualGuide: sharedStructure('Show an artisan working at dusk', 'Your work tells a story') },
        { name: 'Family ad', topic: 'Home ownership', platform: 'instagram', primaryText: 'A place to belong.', headline: 'Home for all', cta: 'contact_us', visualGuide: sharedStructure('Show a family entering a home at dusk', 'Come home to more') },
      ],
    };
    expect(campaignSectionVisualGuidanceError(input, 'socialAds')).toContain('same asset format and layout');
  });
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

  it('keeps calendar dates aligned with generated asset schedules', () => {
    const input = pack();
    input.socialPosts[0].scheduledDate = '2026-08-05';
    input.googleAds[0].startDate = '2026-08-06';
    input.socialAds[0].scheduledDate = '2026-08-07';
    input.blogOutlines[0].publishDate = '2026-08-08';

    expect(buildCampaignCalendar(input, 4, '2026-08-03').map((item) => item.date)).toEqual([
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
    ]);
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

  it('repairs generated platform labels even when the brief only names general platforms', () => {
    const input = pack();
    input.socialPosts[0] = {
      ...input.socialPosts[0],
      platforms: ['linkedin'],
      creativeBrief: 'Design an Instagram carousel for the home-loan journey.',
    };
    input.socialAds[0] = {
      ...input.socialAds[0],
      platform: 'facebook',
      name: 'Instagram home-for-all ad',
      topic: 'Instagram lead campaign',
      visualGuide: 'Use an Instagram feed composition.',
    };

    const aligned = alignCampaignPackToRequestedPlatforms(
      input,
      'Platforms: Instagram, Facebook, and LinkedIn. CTA: Drive to the website or phone number.',
    );

    expect(aligned.socialPosts[0].creativeBrief).toBe('Design a LinkedIn carousel for the home-loan journey.');
    expect(aligned.socialAds[0]).toEqual(expect.objectContaining({
      platform: 'facebook',
      name: 'Facebook home-for-all ad',
      topic: 'Facebook lead campaign',
      visualGuide: 'Use a Facebook feed composition.',
    }));
    expect(campaignPlatformConsistencyFindings(aligned, 'Platforms: Instagram, Facebook, and LinkedIn.')).toEqual([]);
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

  it('limits Humanizer edits to natural-language social and blog fields', () => {
    const input = pack();
    const patches = [
      { group: 'socialPosts' as const, index: 0, field: 'caption', value: 'A more natural caption.', reason: 'Rhythm' },
      { group: 'socialAds' as const, index: 0, field: 'primaryText', value: 'A more natural ad.', reason: 'Clarity' },
      { group: 'blogOutlines' as const, index: 0, field: 'excerpt', value: 'A clearer summary.', reason: 'Clarity' },
      { group: 'blogOutlines' as const, index: 0, field: 'outline[0]', value: 'A more natural section.', reason: 'Rhythm' },
      { group: 'googleAds' as const, index: 0, field: 'descriptions[0]', value: 'Forbidden Google edit.', reason: 'Tone' },
      { group: 'socialAds' as const, index: 0, field: 'cta', value: 'learn_more', reason: 'Forbidden CTA edit' },
      { group: 'socialPosts' as const, index: 0, field: 'visualGuide', value: 'Forbidden structure edit.', reason: 'Tone' },
      { group: 'blogOutlines' as const, index: 0, field: 'title', value: 'Forbidden metadata edit.', reason: 'Tone' },
    ];

    expect(applicableHumanizerPatches(input, patches).map((patch) => `${patch.group}.${patch.field}`)).toEqual([
      'socialPosts.caption',
      'socialAds.primaryText',
      'blogOutlines.excerpt',
      'blogOutlines.outline[0]',
    ]);
  });

  it.each([
    ['Contact Us', 'contact_us'],
    ['Book a Demo', 'contact_us'],
    ['Schedule a discovery call', 'contact_us'],
    ['Download the app', 'download'],
    ['Buy now', 'shop_now'],
    ['Register today', 'sign_up'],
    ['Learn more', 'learn_more'],
    ['Get started', 'learn_more'],
  ])('maps the desired action %s to the authoritative social CTA %s', (desiredAction, expected) => {
    expect(expectedSocialAdCta(desiredAction)).toBe(expected);
  });

  it('ignores a model finding that incorrectly rejects a valid Contact Us button enum', () => {
    const input = pack();
    input.socialAds[0].cta = 'contact_us';
    const finding = {
      group: 'socialAds' as const,
      index: 0,
      category: 'cta' as const,
      severity: 'blocking' as const,
      problem: 'The CTA button value contact_us should be changed to a visible Contact Us label.',
      suggestion: 'Change the CTA enum.',
    };

    expect(reviewFindingFlagsValidSocialAdCta(finding, input, 'Contact Us')).toBe(true);
    input.socialAds[0].cta = 'learn_more';
    expect(reviewFindingFlagsValidSocialAdCta(finding, input, 'Contact Us')).toBe(false);
  });

  it('applies indexed Google ad QA patches and reports invalid patch targets', () => {
    const input = pack();
    input.googleAds[0].descriptions = ['First line.', 'Second line.'];
    input.googleAds[0].callouts = ['Original', 'Serving Semi-Urban &'];
    const patches = [
      { group: 'googleAds' as const, index: 0, field: 'descriptions[1]', value: 'A complete second line.', reason: 'Complete the sentence.' },
      { group: 'googleAds' as const, index: 0, field: 'callouts[1]', value: 'Serving Semi-Urban Areas', reason: 'Complete the callout.' },
      { group: 'googleAds' as const, index: 0, field: 'descriptions[9]', value: 'Out of range.', reason: 'Invalid index.' },
      { group: 'googleAds' as const, index: 0, field: 'finalUrl', value: 'https://example.com', reason: 'Disallowed field.' },
    ];

    expect(applicableContentPatches(input, patches)).toHaveLength(2);
    const result = applyContentPatches(input, patches);
    expect(result.googleAds[0].descriptions[1]).toBe('A complete second line.');
    expect(result.googleAds[0].callouts?.[1]).toBe('Serving Semi-Urban Areas');
    expect(reviewFindingResolvedByPatches({
      group: 'googleAds', index: 0, severity: 'blocking', problem: 'The description is incomplete.', suggestion: 'Complete it.',
    }, patches)).toBe(true);
  });

  it('rejects malformed whole-array patches instead of collapsing Google assets to one string', () => {
    const input = pack();
    const patches = [
      { group: 'googleAds' as const, index: 0, field: 'callouts', value: 'Berry Studio', reason: 'Malformed array patch.' },
      { group: 'googleAds' as const, index: 0, field: 'headlines', value: ['One', 'Two'], reason: 'Valid array patch.' },
    ];

    expect(applicableContentPatches(input, patches)).toEqual([patches[1]]);
  });

  it('does not count or apply no-op editorial patches', () => {
    const input = pack();
    const patches = [
      { group: 'socialPosts' as const, index: 0, field: 'caption', value: input.socialPosts[0].caption, reason: 'Already natural.' },
      { group: 'blogOutlines' as const, index: 0, field: 'outline[0]', value: input.blogOutlines[0].outline[0], reason: 'Already clear.' },
    ];

    expect(applicableContentPatches(input, patches)).toEqual([]);
    expect(applicableHumanizerPatches(input, patches)).toEqual([]);
  });

  it('treats subjective blog usefulness complaints as polish, not a blocking contract failure', () => {
    const findings = normalizeQaFindings({
      findings: [{
        group: 'blogOutlines',
        index: 0,
        category: 'deliverable_contract',
        severity: 'blocking',
        problem: 'The blog outline is generic and repetitive and does not describe a useful article. The outline is a placeholder that does not answer the brief.',
        suggestion: 'Make it more specific.',
      }],
    });

    expect(findings[0]).toMatchObject({ category: 'polish', severity: 'note' });
  });

  it('repairs Google ad text clipped at platform limits into complete copy', () => {
    const input = pack();
    input.googleAds[0].descriptions = [
      'Aptus is your one-stop solution for a dream home. We understand your needs and make.',
      'Get a home loan designed for you. Aptus serves self-employed families with an easy.',
      'Your long-awaited dream home is possible. We offer a clear financial solution for families',
    ];
    input.googleAds[0].callouts = ['Serving Semi-Urban &'];

    const repaired = repairCampaignPack(input, { desiredAction: 'Drive to website or phone number for inquiries.' }).pack.googleAds[0];
    expect(repaired.descriptions).toContain('Aptus is your one-stop solution for a dream home.');
    expect(repaired.descriptions).toContain('Get a home loan designed for you.');
    expect(repaired.descriptions).toContain('Your long-awaited dream home is possible. We offer a clear financial solution.');
    expect(repaired.descriptions.every((description) => description.length <= 90 && /[.!?]$/.test(description))).toBe(true);
    expect(repaired.callouts).toContain('Serving Semi-Urban');
  });

  it('removes an unverified phone number while preserving an explicitly confirmed one', () => {
    const unverified = pack();
    unverified.socialPosts[0].caption = 'A clear conversation is all it takes. Call us at +91 87544 00008 or visit our website.';
    const cleaned = repairCampaignPack(unverified, {
      desiredAction: 'Drive to website or phone number for inquiries.',
      confirmedFacts: [],
    });
    expect(cleaned.pack.socialPosts[0].caption).toBe('A clear conversation is all it takes. Visit our website.');
    expect(cleaned.notes).toEqual(expect.arrayContaining([expect.stringContaining('unverified phone number')]));

    const verified = pack();
    verified.socialPosts[0].caption = 'Call us at +91 87544 00008 or visit our website.';
    expect(repairCampaignPack(verified, {
      desiredAction: 'Call +91 87544 00008 for inquiries.',
      confirmedFacts: [],
    }).pack.socialPosts[0].caption).toContain('+91 87544 00008');
  });

  it('uses a concise presentable title when the creative strategist falls back', () => {
    const planner = fallbackPlannerOutput('Create a campaign for Aptus.', { projectName: 'Aptus', campaignName: '' });
    planner.internalBrief.offerOrSubject = 'Aptus Value Housing Finance India Ltd is a Home Loan Company. Aptus serves self-employed families across semi-urban markets.';
    planner.internalBrief.confirmedFacts = ['Brand name: Aptus.'];
    expect(fallbackCreativeDirection(planner).title).toBe('Aptus Campaign Direction');
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

  it('repairs quantified claims when the client explicitly forbids statistics', () => {
    const input = pack();
    input.socialPosts[0].caption = 'Turn your commute into French practice. Learn in as little as 5 minutes a day. Start learning French on Duolingo.';
    const brief = {
      desiredAction: 'Start learning French on Duolingo.',
      keywordTargets: [],
      confirmedFacts: [],
      restrictions: ['Do not add statistics, discounts, testimonials, or guarantees'],
    };

    expect(deterministicQualityFindings(input, emptyBrandInstructions(), brief)).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'unsupported_claim', severity: 'blocking', problem: expect.stringContaining('5 minutes') }),
    ]));

    const repaired = repairCampaignPack(input, brief);
    expect(repaired.pack.socialPosts[0].caption).toBe('Turn your commute into French practice. Start learning French on Duolingo.');
    expect(repaired.notes).toEqual(expect.arrayContaining([expect.stringContaining('quantified claim')]));
    expect(deterministicQualityFindings(repaired.pack, emptyBrandInstructions(), brief).filter((finding) => finding.severity === 'blocking')).toEqual([]);
  });

  it('extracts an explicit CTA label into the deterministic brief', () => {
    const planner = fallbackPlannerOutput(
      'Create 2 Instagram posts. CTA: Start learning French on Duolingo.',
      { projectName: 'Duolingo', campaignName: '' },
    );

    expect(planner.internalBrief.desiredAction).toBe('Start learning French on Duolingo.');
  });

  it('repairs paid-social button enums from the explicit client CTA', () => {
    const input = pack();
    input.socialAds[0].cta = 'contact_us';
    const brief = {
      desiredAction: 'Start learning French on Duolingo.',
      keywordTargets: [],
      confirmedFacts: [],
      restrictions: [],
    };

    expect(deterministicQualityFindings(input, emptyBrandInstructions(), brief)).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'cta', severity: 'blocking', problem: expect.stringContaining('learn_more') }),
    ]));
    expect(repairCampaignPack(input, brief).pack.socialAds[0].cta).toBe('learn_more');
  });

  it('reserves a Google headline slot for the verified CTA after keyword rebuilding', () => {
    const input = pack();
    input.googleAds[0].keywords = ['orthodontic training'];
    input.googleAds[0].headlines = [
      ...Array.from({ length: 15 }, (_, index) => `Orthodontic Training ${index + 1}`),
      'Contact Us',
    ];
    const brief = {
      desiredAction: 'Contact Us or Book a Demo.',
      keywordTargets: ['orthodontic training'],
      confirmedFacts: [],
      restrictions: [],
    };

    const repaired = repairCampaignPack(input, brief).pack.googleAds[0];
    expect(repaired.headlines).toHaveLength(15);
    expect(repaired.headlines).toContain('Contact Us');
  });
});
