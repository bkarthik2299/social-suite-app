import { describe, expect, it } from 'vitest';
import type { CampaignPack } from '../../supabase/functions/_shared/campaign_pack';
import {
  applyBrandGroundingDefaults,
  applyBrandGroundingToCreativeDirection,
  brandGroundingQualityFindings,
  buildBrandGrounding,
  groundBrandInstructionsWithBrand,
  groundPlannerOutputWithBrand,
  researchEvidenceScore,
  sanitizeResearchBriefWithBrand,
} from '../../supabase/functions/_shared/brand_grounding';
import { emptyBrandInstructions, fallbackPlannerOutput } from '../../supabase/functions/_shared/agent_contracts';
import { deterministicQualityFindings } from '../../supabase/functions/_shared/campaign_workflow';

const berryMarkdown = `# Berry Studio AI – Brand Knowledge

## Identity

**Brand Name:** Berry Studio AI
**Company Overview:**
Berry Studio AI is a software company offering AI-powered practice management tools for orthodontic practices. Products support patient intake, task management, treatment planning, insurance verification, and revenue cycle management.

## Audience

**Primary Audience:**
- Orthodontic practices
- Practice managers and clinic owners

## Voice & Tone

**Writing Dos:**
- Use clear, conversational language.

**Writing Don’ts:**
- Avoid forced jokes.

**Preferred Terms:**
- Juicy idea

## Proof Points

- Purpose-built tools for modern orthodontic practices.
`;

const grounding = () => buildBrandGrounding({
  sourceTitle: 'Berry Studio AI Knowledge',
  markdown: berryMarkdown,
  colors: [
    { name: 'primary', role: 'primary', hex: '#0B0623' },
    { name: 'accent', role: 'secondary', hex: '#7C38F6' },
    { name: 'text', role: 'background', hex: '#FFFFFF' },
  ],
  documentGeneratedAt: '2026-06-09T09:41:00.000Z',
  guide: {
    brand_name: 'Berry Studio AI',
    website_url: 'https://berrystudio.ai/en',
    elevator_pitch: 'Software should be calm, capable, and invisible.',
    sample_copy: ['Book a Demo'],
    writing_dos: ['Explain the practice benefit before the ask.'],
    writing_donts: ['Avoid forced humor.'],
    preferred_terms: ['book', 'care', 'demo'],
    updated_at: '2026-06-10T15:04:29.000Z',
    custom_sections: [{ proof_points: ['Berry Forms supports mobile-first patient intake.'] }],
  },
});

const pack = (strategySummary: string, socialCaption = 'Book a Demo for a calmer orthodontic workflow.'): CampaignPack => ({
  strategy: {
    title: 'A calmer orthodontic practice',
    summary: strategySummary,
    objectives: ['Help orthodontic practice managers understand the patient-intake workflow.'],
    contentPillars: ['Patient intake', 'Practice management'],
  },
  socialPosts: [{
    name: 'Waiting room reset',
    topic: 'Instagram organic post',
    caption: socialCaption,
    platforms: ['instagram'],
  }],
  googleAds: [],
  socialAds: [],
  blogOutlines: [],
  calendar: [],
});

describe('brand grounding', () => {
  it('keeps compiled Brand Knowledge and current guide facts in one canonical context', () => {
    const value = grounding();

    expect(value.brandName).toBe('Berry Studio AI');
    expect(value.websiteUrl).toBe('https://berrystudio.ai/en');
    expect(value.businessSummary).toContain('practice management tools for orthodontic practices');
    expect(value.audienceLabels).toEqual(['Orthodontic practices', 'Practice managers and clinic owners']);
    expect(value.audienceSummary).toContain('Orthodontic practices');
    expect(value.primaryCta).toBe('Book a Demo');
    expect(value.brandColors.map((color) => color.hex)).toEqual(['#0B0623', '#7C38F6', '#FFFFFF']);
    expect(value.requiredFacts.join(' ')).toContain('patient intake');
    expect(value.preferredTerms).toEqual(['book', 'care', 'demo']);
    expect(value.preferredTerms).not.toContain('Juicy idea');
    expect(value.documentStale).toBe(true);
  });

  it('turns a broad shopping objective into a channel-safe CTA instead of requiring the full sentence', () => {
    const sweetGrounding = buildBrandGrounding({
      guide: {
        brand_name: 'Sweet Kaaram Coffee',
        website_url: 'https://sweetkaramcoffee.in',
        elevator_pitch: 'Traditional South Indian snacks delivered globally.',
        target_audience: 'Customers who value South Indian snacks and nostalgic homemade taste.',
      },
      markdown: '',
    });
    const input = pack('Sweet Kaaram Coffee brings traditional South Indian snacks to customers who value nostalgic homemade taste.');
    input.googleAds = [0, 1, 2].map((index) => ({
      name: `Monsoon search ${index + 1}`,
      topic: 'South Indian monsoon snacks',
      keywords: ['South Indian snacks'],
      headlines: ['Rainy Day Snack Rituals'],
      descriptions: ['Browse traditional South Indian snacks for rainy-day moments.'],
    }));
    const context = {
      audience: 'Customers who value South Indian snacks and nostalgic homemade taste.',
      offerOrSubject: 'Traditional South Indian snacks delivered globally.',
      desiredAction: 'Engage with the campaign and click through to the website to browse and buy relevant products.',
    };

    const grounded = applyBrandGroundingDefaults(input, sweetGrounding, context);

    expect(grounded.googleAds.every((ad) => ad.headlines.includes('Shop Now'))).toBe(true);
    expect(brandGroundingQualityFindings(grounded, sweetGrounding, context)
      .filter((finding) => /campaign CTA/i.test(finding.problem))).toEqual([]);
    expect(JSON.stringify(grounded)).not.toContain(context.desiredAction);
  });

  it('does not promote undefined Brand Knowledge placeholders into campaign facts', () => {
    const sparseMarkdown = `# KYRO Construction SaaS — Brand Knowledge Document

## Identity
- **Brand name:** KYRO Construction SaaS
- **Industry:** Not explicitly stated; brand name suggests construction software (SaaS)

## Writing Rules
- **Writing Dos:** Not yet defined
- **Writing Don'ts:** Not yet defined
- **Preferred Terms:** Not yet defined
- **Avoided Terms:** None provided

## Proof Points
None provided. (No case studies, testimonials, or data points available.)`;
    const sparse = buildBrandGrounding({
      sourceTitle: 'KYRO Construction SaaS Knowledge',
      markdown: sparseMarkdown,
      guide: { brand_name: 'KYRO Construction SaaS' },
    });

    expect(sparse.brandName).toBe('KYRO Construction SaaS');
    expect(sparse.businessSummary).toBe('');
    expect(sparse.proofPoints).toEqual([]);
    expect(sparse.writingDos).toEqual([]);
    expect(sparse.writingDonts).toEqual([]);
    expect(sparse.preferredTerms).toEqual([]);
    expect(sparse.avoidedTerms).toEqual([]);

    const prompt = 'Promote KYRO Construction SaaS. Target construction project managers and site operations leaders.';
    const planner = fallbackPlannerOutput(prompt, { projectName: 'KYRO Model Evaluation', campaignName: '' });
    planner.internalBrief.audience = 'construction project managers and site operations leaders';
    const grounded = groundPlannerOutputWithBrand(planner, sparse, prompt);
    expect(grounded.researchQuery).toContain('construction project managers and site operations leaders');
    expect(grounded.researchQuery).not.toContain('verified primary audience');
    expect(grounded.researchQuery).not.toContain('leaders. should');

    const relevantScore = researchEvidenceScore({
      title: 'Construction project management priorities for site operations leaders',
      url: 'https://example.com/construction-project-management',
      content: 'Construction project managers coordinate teams, schedules, budgets, safety, and site operations across active jobs.',
    }, sparse, {
      audience: grounded.internalBrief.audience,
      offering: grounded.internalBrief.offerOrSubject,
    });
    const namesakeScore = researchEvidenceScore({
      title: 'KYRO Construction SaaS employee directory',
      url: 'https://example.com/kyro-directory',
      content: 'A generic company directory listing employee names, office contacts, and corporate departments.',
    }, sparse, {
      audience: grounded.internalBrief.audience,
      offering: grounded.internalBrief.offerOrSubject,
    });
    expect(relevantScore).toBeGreaterThanOrEqual(3);
    expect(namesakeScore).toBeLessThan(3);

    const sparsePack = pack('KYRO Construction SaaS is for construction project managers and site operations leaders.');
    sparsePack.socialPosts[0] = {
      name: 'Update chase',
      topic: 'Calmer workflow and practical fit',
      caption: 'KYRO Construction SaaS is for project managers who want more clarity and less chasing. Request a demo.',
      platforms: ['linkedin'],
      creativeBrief: 'Frame KYRO Construction SaaS as support for organized day-to-day project oversight, without claiming specific features.',
      visualGuide: 'Use neutral construction tones with KYRO brand colors for emphasis.',
    };
    sparsePack.googleAds = [{
      name: 'KYRO search',
      topic: 'Construction SaaS',
      keywords: ['construction SaaS'],
      finalUrl: 'https://invented.example/demo',
      headlines: ['Clearer Coordination', 'Less Update Chasing', 'Keep Jobs Moving', 'Clearer Work', 'Better Oversight', 'Simpler Workflow', 'More Clarity', 'Calmer Workflow'],
      descriptions: ['See how KYRO supports clearer coordination.', 'Request a demo for construction teams.'],
      callouts: ['Support clearer', 'See if it fits'],
    }];
    sparsePack.googleAds.push({ ...sparsePack.googleAds[0], name: 'Second search angle' });
    sparsePack.socialAds = [{
      name: 'KYRO ad',
      topic: 'Construction software',
      platform: 'facebook',
      primaryText: 'KYRO Construction SaaS puts your team work in one view.',
      headline: 'Keep the Job Moving',
      description: 'A demo takes 20 minutes. Request a demo.',
      cta: 'learn_more',
      destinationUrl: 'https://invented.example/demo',
      visualGuide: 'Use a clean KYRO accent with neutral site photography.',
    }];
    const sparseContext = {
      prompt,
      audience: grounded.internalBrief.audience,
      offerOrSubject: grounded.internalBrief.offerOrSubject,
      desiredAction: 'Request a demo.',
      confirmedFacts: ['Brand name: KYRO Construction SaaS.', 'Target audience: construction project managers and site operations leaders.', 'Desired action: Request a demo.'],
    };
    expect(brandGroundingQualityFindings(sparsePack, sparse, sparseContext)).toEqual(expect.arrayContaining([
      expect.objectContaining({ problem: expect.stringContaining('invents a destination URL') }),
      expect.objectContaining({ problem: expect.stringContaining('unverified feature') }),
    ]));

    const sparseSafe = applyBrandGroundingDefaults(sparsePack, sparse, sparseContext);
    expect(sparseSafe.googleAds[0].finalUrl).toBeUndefined();
    expect(sparseSafe.googleAds[0].headlines.length).toBeGreaterThanOrEqual(8);
    expect(sparseSafe.googleAds[0].headlines.length).toBeLessThanOrEqual(15);
    expect(new Set(sparseSafe.googleAds[0].headlines).size).toBe(sparseSafe.googleAds[0].headlines.length);
    expect(sparseSafe.googleAds[0].descriptions.every((value) => value.length <= 90 && /[.!?]$/.test(value))).toBe(true);
    expect(sparseSafe.googleAds[1].descriptions.every((value) => value.length <= 90 && /[.!?]$/.test(value))).toBe(true);
    expect(JSON.stringify(sparseSafe.googleAds[0])).not.toBe(JSON.stringify(sparseSafe.googleAds[1]));
    expect(deterministicQualityFindings(sparseSafe, emptyBrandInstructions(), {
      desiredAction: sparseContext.desiredAction,
      keywordTargets: [],
      confirmedFacts: sparseContext.confirmedFacts,
    }).filter((finding) => finding.group === 'googleAds' && finding.severity === 'warning')).toEqual([]);
    expect(sparseSafe.socialAds[0].destinationUrl).toBeUndefined();
    expect(sparseSafe.socialAds[0].primaryText).toMatch(/^Construction project managers/);
    expect(sparseSafe.socialAds[0].visualGuide).toContain('one member of the target audience');
    expect(JSON.stringify(sparseSafe.socialAds)).not.toMatch(/\. site operations|member of Construction|team of Construction/);
    expect(JSON.stringify(sparseSafe)).not.toMatch(/invented\.example|20 minutes|puts your team work|Less Update Chasing|Keep (?:Jobs|the Job) Moving|supports? clearer|more clarity|less chasing|organized day-to-day project oversight|calmer workflow|KYRO brand colors|KYRO accent/i);
    expect(JSON.stringify(sparseSafe)).toMatch(/Request a demo/i);
    expect(sparseSafe.strategy.summary).toContain('Brand Knowledge supplies no verified capabilities or proof points');
    expect(sparseSafe.socialPosts[0].creativeBrief).toContain('avoid unverified capabilities or outcomes');
    expect(JSON.stringify(sparseSafe)).not.toMatch(/safety orange|steel gray|off-white/i);
    expect(brandGroundingQualityFindings(sparseSafe, sparse, sparseContext)).toEqual([]);

    const safeResearch = sanitizeResearchBriefWithBrand({
      question: grounded.researchQuery,
      findings: [
        {
          claim: 'Construction project managers need accurate, timely information between office and site.',
          sourceNumbers: [1],
          confidence: 'high',
          publicUse: 'safe',
          campaignUse: 'Frame KYRO as a way to keep project communication in one place.',
        },
        {
          claim: 'KYRO includes voice notes, document management, and financial insights.',
          sourceNumbers: [2],
          confidence: 'high',
          publicUse: 'safe',
          campaignUse: 'Promote these product capabilities.',
        },
      ],
    }, sparse, sparseContext);
    expect(safeResearch.findings).toHaveLength(1);
    expect(safeResearch.findings[0].sourceNumbers).toEqual([1]);
    expect(safeResearch.findings[0].campaignUse).toContain('do not attribute an unverified feature or outcome');

    const sparseDirection = applyBrandGroundingToCreativeDirection({
      title: 'Clearer coordination',
      centralIdea: 'KYRO Construction SaaS supports clearer project oversight.',
      audienceProblem: 'Project managers juggle many moving parts.',
      promise: 'Less chasing and calmer workflow.',
      keyMessages: ['Show how KYRO organizes day-to-day project oversight.'],
      callsToAction: ['Request a demo'],
      contentAngles: ['More clarity for site operations leaders.'],
      platformGuidance: { linkedin: 'Connect KYRO to clearer coordination.' },
      strategy: {
        title: 'Keep the job moving',
        summary: 'Position KYRO as support for organized construction workflows.',
        objectives: ['Promise simpler coordination.'],
        contentPillars: ['Calmer workflow'],
      },
    }, sparse, sparseContext);
    expect(JSON.stringify(sparseDirection)).not.toMatch(/clearer (?:coordination|project oversight)|less chasing|calmer workflow|organizes day-to-day|simpler coordination|organized construction workflows|keep the job moving/i);
  });

  it('grounds the planner before research instead of keeping a broad app assumption', () => {
    const prompt = 'i want some creative and funny social media campaign with some insta posts, facebook ads and some google ads to promote the berrystudio app';
    const planner = fallbackPlannerOutput(prompt, { projectName: 'Berry Studio AI', campaignName: '' });
    planner.internalBrief.audience = 'Broad app audience; no specific segment was provided.';
    planner.internalBrief.assumptions.push('Keep claims general because no features or proof points were supplied.');

    const grounded = groundPlannerOutputWithBrand(planner, grounding(), prompt);
    const groundedAgain = groundPlannerOutputWithBrand(grounded, grounding(), prompt);

    expect(grounded.internalBrief.audience).toContain('Orthodontic practices');
    expect(grounded.internalBrief.offerOrSubject).toContain('practice management tools');
    expect(grounded.internalBrief.desiredAction).toBe('Book a Demo');
    expect(grounded.internalBrief.confirmedFacts.join(' ')).toContain('patient intake');
    expect(grounded.internalBrief.assumptions.join(' ')).not.toContain('no features');
    expect(grounded.researchQuery).toContain('Orthodontic practices');
    expect(grounded.researchQuery).toContain('berrystudio.ai');
    expect(groundedAgain.campaignGuidance.match(/Verified brand context is authoritative/g)).toHaveLength(1);
  });

  it('prevents the Brand Guide Agent from filtering out core identity, audience, offering, and restrictions', () => {
    const filtered = groundBrandInstructionsWithBrand(emptyBrandInstructions('Berry'), grounding());

    expect(filtered.approvedFacts.join(' ')).toContain('practice management tools');
    expect(filtered.approvedFacts.join(' ')).toContain('Orthodontic practices');
    expect(filtered.hardRules.join(' ')).toContain('Avoid forced humor');
    expect(filtered.hardRules.join(' ')).toContain('official brand website');
  });

  it('blocks generic creative-app strategy and accepts product-grounded orthodontic strategy', () => {
    const generic = pack('A playful creative app campaign for a broad audience.', 'A juicy idea for your next creative project.');
    generic.strategy = {
      title: 'Creative App Curiosity',
      summary: 'A playful creative app campaign for a broad audience.',
      objectives: ['Generate generic app awareness.'],
      contentPillars: ['Playful curiosity'],
    };
    expect(brandGroundingQualityFindings(generic, grounding()).map((finding) => finding.problem)).toEqual(expect.arrayContaining([
      expect.stringContaining('verified primary audience'),
      expect.stringContaining('verified business or offering'),
      expect.stringContaining('campaign CTA'),
    ]));

    const groundedPack = pack('Berry Studio AI helps orthodontic practice teams make patient intake and practice management feel calmer.');
    expect(brandGroundingQualityFindings(groundedPack, grounding())).toEqual([]);

    groundedPack.socialPosts[0].visualGuide = 'Use soft green and white with a clean layout.';
    expect(brandGroundingQualityFindings(groundedPack, grounding())).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: 'socialPosts', problem: expect.stringContaining('outside the verified brand palette') }),
    ]));

    const repairedPalette = applyBrandGroundingDefaults(groundedPack, grounding());
    expect(repairedPalette.socialPosts[0].visualGuide).toContain('verified brand palette');
    expect(repairedPalette.socialPosts[0].visualGuide).not.toMatch(/\bgreen\b/i);
    expect(brandGroundingQualityFindings(repairedPalette, grounding())).toEqual([]);

    groundedPack.socialPosts[0].visualGuide = 'Use verified purple and white brand colors.';
    expect(brandGroundingQualityFindings(groundedPack, grounding())).toEqual([]);

    groundedPack.socialAds = [{
      name: 'Practice workflow ad',
      topic: 'Patient intake',
      platform: 'facebook',
      primaryText: 'Book a Demo for a calmer orthodontic practice workflow.',
      headline: 'Calmer patient intake',
      cta: 'contact_us',
      destinationUrl: 'Berry Studio app page',
    }];
    expect(brandGroundingQualityFindings(groundedPack, grounding())).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: 'socialAds', problem: expect.stringContaining('official website') }),
    ]));
  });

  it('ranks audience-specific evidence above similarly named but unrelated sources', () => {
    const value = grounding();
    const unrelated = researchEvidenceScore({
      title: 'The Future of UX Research: Where Does AI Fit In?',
      url: 'https://www.useberry.com/blog/ai-research',
      content: '',
    }, value);
    const relevant = researchEvidenceScore({
      title: 'AI trends for orthodontic practice management',
      url: 'https://example.com/orthodontic-ai',
      content: 'Orthodontic practice managers are evaluating patient intake and treatment-planning workflows.',
    }, value);

    expect(unrelated).toBeLessThan(3);
    expect(relevant).toBeGreaterThanOrEqual(3);
  });

  it('fills verified destinations and reader-facing CTAs without inventing campaign details', () => {
    const input = pack('Berry Studio AI supports orthodontic practice management and patient intake.');
    input.googleAds = [{
      name: 'Practice software',
      topic: 'orthodontic practice software',
      keywords: ['orthodontic practice software'],
      headlines: ['Orthodontic Practice Tools'],
      descriptions: ['Explore software for modern orthodontic teams.'],
    }];
    input.socialAds = [{
      name: 'Practice ad',
      topic: 'Practice workflow',
      platform: 'facebook',
      primaryText: 'Berry Studio AI supports modern orthodontic workflows.',
      headline: 'A calmer practice workflow',
      cta: 'learn_more',
    }];

    const grounded = applyBrandGroundingDefaults(input, grounding());
    expect(grounded.googleAds[0].finalUrl).toBe('https://berrystudio.ai/en');
    expect(grounded.googleAds[0].headlines).toContain('Book a Demo');
    expect(grounded.socialAds[0]).toMatchObject({
      destinationUrl: 'https://berrystudio.ai/en',
      cta: 'contact_us',
      description: 'Book a Demo.',
    });
    expect(brandGroundingQualityFindings(grounded, grounding())).toEqual([]);
  });

  it('keeps Google CTA insertion within platform limits', () => {
    const input = pack('Berry Studio AI supports orthodontic practice management and patient intake.');
    input.googleAds = [{
      name: 'Practice software',
      topic: 'orthodontic practice software',
      keywords: ['orthodontic practice software'],
      headlines: Array.from({ length: 15 }, (_, index) => `Practice Headline ${index + 1}`),
      descriptions: ['Explore software for modern orthodontic teams.', 'See a calmer practice workflow.'],
    }];

    const grounded = applyBrandGroundingDefaults(input, grounding());
    expect(grounded.googleAds[0].headlines).toHaveLength(15);
    expect(grounded.googleAds[0].headlines).toContain('Book a Demo');
    expect(grounded.googleAds[0].headlines.every((headline) => headline.length <= 30)).toBe(true);
    expect(grounded.googleAds[0].descriptions.every((description) => description.length <= 90)).toBe(true);
  });

  it('keeps unmapped product names from becoming invented feature claims', () => {
    const productGrounding = buildBrandGrounding({
      sourceTitle: 'Berry Studio AI Knowledge',
      markdown: berryMarkdown,
      guide: {
        brand_name: 'Berry Studio AI',
        website_url: 'https://berrystudio.ai/en',
        elevator_pitch: 'AI-powered practice management tools for orthodontic practices.',
        sample_copy: ['Book a Demo'],
        target_audience: ['Orthodontic practices'],
        custom_sections: [{
          proof_points: [
            'The product suite includes BerryForms, BerryTasks, BerryPlans, BerryPay, BerryReports, and BerryNerd.',
          ],
        }],
      },
    });
    const input = pack('Berry Studio AI supports orthodontic practice management and patient intake.');
    input.socialPosts[0].caption = 'BerryPlans and BerryTasks keep treatment planning organized. Book a Demo.';
    input.socialAds = [{
      name: 'Practice ad',
      topic: 'Patient intake',
      platform: 'facebook',
      primaryText: 'BerryForms handles patient data collection for your team.',
      headline: 'A calmer workflow',
      description: 'BerryTasks, BerryPlans, BerryPay, and BerryReports work together. Book a Demo.',
      cta: 'contact_us',
      destinationUrl: 'https://berrystudio.ai/en',
    }];

    expect(brandGroundingQualityFindings(input, productGrounding)).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: 'socialPosts', problem: expect.stringContaining('without an explicit Brand Knowledge mapping') }),
      expect.objectContaining({ group: 'socialAds', problem: expect.stringContaining('without an explicit Brand Knowledge mapping') }),
    ]));

    const grounded = applyBrandGroundingDefaults(input, productGrounding);
    expect(grounded.socialPosts[0].caption).toContain('Berry Studio AI tools keep treatment planning organized');
    expect(grounded.socialAds[0].primaryText).toContain('Berry Studio AI handles patient data collection');
    expect(grounded.socialAds[0].description).toContain('Berry Studio AI tools work together');
    expect(JSON.stringify(grounded)).not.toMatch(/BerryForms|BerryTasks|BerryPlans|BerryPay|BerryReports/);
    expect(brandGroundingQualityFindings(grounded, productGrounding)).toEqual([]);

    const direction = applyBrandGroundingToCreativeDirection({
      title: 'A calmer practice',
      centralIdea: 'BerryForms and BerryTasks support a modern workflow.',
      audienceProblem: 'Orthodontic teams need clarity.',
      promise: 'Calmer practice management.',
      keyMessages: ['BerryPlans handles treatment planning.'],
      callsToAction: ['Book a Demo'],
      contentAngles: ['Show how BerryPay supports the revenue workflow.'],
      platformGuidance: { instagram: 'Mention BerryReports for reporting.' },
      strategy: {
        title: 'Practice workflow',
        summary: 'Berry Studio AI supports orthodontic teams.',
        objectives: ['Explain how BerryForms handles intake.'],
        contentPillars: ['BerryTasks for task management.'],
      },
    }, productGrounding);
    expect(JSON.stringify(direction)).not.toMatch(/BerryForms|BerryTasks|BerryPlans|BerryPay|BerryReports/);
  });
});
