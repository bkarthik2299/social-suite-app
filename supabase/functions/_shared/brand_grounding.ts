import type { BrandInstructions, CreativeDirection, PlannerOutput, QaFinding, ResearchBrief } from './agent_contracts.ts';
import type { CampaignPack } from './campaign_pack.ts';

export type BrandGuideSnapshot = {
  brand_name?: unknown;
  website_url?: unknown;
  industry?: unknown;
  elevator_pitch?: unknown;
  target_audience?: unknown;
  personality?: unknown;
  writing_dos?: unknown;
  writing_donts?: unknown;
  preferred_terms?: unknown;
  avoided_terms?: unknown;
  sample_copy?: unknown;
  content_pillars?: unknown;
  photography_style?: unknown;
  illustration_style?: unknown;
  iconography_rules?: unknown;
  layout_composition?: unknown;
  social_rules?: unknown;
  ad_rules?: unknown;
  custom_sections?: unknown;
  updated_at?: unknown;
};

export type BrandColorSnapshot = {
  name?: unknown;
  role?: unknown;
  hex?: unknown;
};

export type BrandGrounding = {
  sourceTitle: string;
  brandName: string;
  websiteUrl: string;
  businessSummary: string;
  audienceSummary: string;
  audienceLabels: string[];
  proofPoints: string[];
  primaryCta: string;
  writingDos: string[];
  writingDonts: string[];
  preferredTerms: string[];
  avoidedTerms: string[];
  brandColors: Array<{ name: string; role: string; hex: string }>;
  visualRules: string[];
  requiredFacts: string[];
  audienceAnchors: string[];
  offeringAnchors: string[];
  guideUpdatedAt: string;
  documentGeneratedAt: string;
  documentStale: boolean;
};

export type BrandCampaignContext = {
  prompt?: string;
  audience?: string;
  offerOrSubject?: string;
  desiredAction?: string;
  confirmedFacts?: string[];
  requestedChannels?: string[];
  tone?: string[];
};

export function buildBrandGrounding({
  guide,
  colors = [],
  markdown,
  sourceTitle = '',
  documentGeneratedAt = '',
}: {
  guide?: BrandGuideSnapshot | null;
  colors?: BrandColorSnapshot[];
  markdown: string;
  sourceTitle?: string;
  documentGeneratedAt?: string;
}): BrandGrounding {
  const currentGuide = guide || {};
  const brandName = firstNonEmpty(
    stringValue(currentGuide.brand_name),
    markdownLabel(markdown, 'Brand Name'),
  );
  const websiteUrl = firstNonEmpty(
    stringValue(currentGuide.website_url),
    firstOfficialWebsite(markdown),
  );
  const companyOverview = meaningfulBrandValue(markdownLabel(markdown, 'Company Overview'));
  const currentProofPoints = meaningfulBrandValues(collectNestedStringArray(currentGuide.custom_sections, 'proof_points'));
  const proofPoints = meaningfulBrandValues(currentProofPoints.length
    ? currentProofPoints
    : markdownListUnderHeading(markdown, 'Proof Points')).slice(0, 8);
  const businessSummary = compact(firstNonEmpty(
    companyOverview,
    stringValue(currentGuide.elevator_pitch),
    proofPoints[0],
    stringValue(currentGuide.industry),
  ), 900);
  const currentAudience = meaningfulBrandValues(stringArray(currentGuide.target_audience));
  const audienceLabels = meaningfulBrandValues(currentAudience.length
    ? currentAudience
    : markdownListAfterLabel(markdown, 'Primary Audience')).slice(0, 12);
  const audienceSummary = compact(audienceLabels.join('; '), 700);
  const currentWritingDos = meaningfulBrandValues(stringArray(currentGuide.writing_dos));
  const writingDos = meaningfulBrandValues(currentWritingDos.length
    ? currentWritingDos
    : markdownListAfterLabel(markdown, 'Writing Dos')).slice(0, 20);
  const currentWritingDonts = meaningfulBrandValues(stringArray(currentGuide.writing_donts));
  const writingDonts = meaningfulBrandValues(currentWritingDonts.length
    ? currentWritingDonts
    : [
      ...markdownListAfterLabel(markdown, 'Writing Don’ts'),
      ...markdownListAfterLabel(markdown, "Writing Don'ts"),
    ]).slice(0, 20);
  const currentPreferredTerms = meaningfulBrandValues(stringArray(currentGuide.preferred_terms));
  const preferredTerms = meaningfulBrandValues(currentPreferredTerms.length
    ? currentPreferredTerms
    : markdownListAfterLabel(markdown, 'Preferred Terms')).slice(0, 20);
  const currentAvoidedTerms = meaningfulBrandValues(stringArray(currentGuide.avoided_terms));
  const avoidedTerms = meaningfulBrandValues(currentAvoidedTerms.length
    ? currentAvoidedTerms
    : markdownListAfterLabel(markdown, 'Avoided Terms')).slice(0, 20);
  const brandColors = colors.map((color) => ({
    name: stringValue(color.name),
    role: stringValue(color.role),
    hex: normalizeHexColor(stringValue(color.hex)),
  })).filter((color) => color.hex).slice(0, 12);
  const visualRules = meaningfulBrandValues([
    stringValue(currentGuide.photography_style),
    stringValue(currentGuide.illustration_style),
    stringValue(currentGuide.iconography_rules),
    stringValue(currentGuide.layout_composition),
    stringValue(currentGuide.social_rules),
    stringValue(currentGuide.ad_rules),
  ]).slice(0, 12);
  const ctaCandidates = uniqueStrings([
    ...stringArray(currentGuide.sample_copy),
    ...collectNestedStringArray(currentGuide.custom_sections, 'observedCtas'),
    ...writingDos,
  ]);
  const primaryCta = ctaCandidates.map((candidate) => canonicalCta(candidate)).find(Boolean) || '';
  const guideUpdatedAt = stringValue(currentGuide.updated_at);
  const documentStale = Boolean(
    guideUpdatedAt
      && documentGeneratedAt
      && Date.parse(guideUpdatedAt) > Date.parse(documentGeneratedAt),
  );
  const requiredFacts = uniqueStrings([
    brandName ? `Brand name: ${brandName}.` : '',
    businessSummary ? `Business and offering: ${businessSummary}` : '',
    audienceSummary ? `Primary audience: ${audienceSummary}` : '',
    websiteUrl ? `Official website: ${websiteUrl}` : '',
    primaryCta ? `Primary brand CTA: ${primaryCta}` : '',
    brandColors.length ? `Verified brand colors: ${brandColors.map(formatBrandColor).join(', ')}.` : '',
    ...proofPoints.slice(0, 3),
  ]).slice(0, 12);
  const audienceAnchors = meaningfulAnchors(audienceSummary, [brandName]).slice(0, 16);
  const offeringAnchors = meaningfulAnchors(
    [businessSummary, ...proofPoints].join(' '),
    [brandName, audienceSummary],
  ).slice(0, 20);

  return {
    sourceTitle,
    brandName,
    websiteUrl,
    businessSummary,
    audienceSummary,
    audienceLabels,
    proofPoints,
    primaryCta,
    writingDos,
    writingDonts,
    preferredTerms,
    avoidedTerms,
    brandColors,
    visualRules,
    requiredFacts,
    audienceAnchors,
    offeringAnchors,
    guideUpdatedAt,
    documentGeneratedAt,
    documentStale,
  };
}

export function brandGroundingText(grounding: BrandGrounding) {
  return [
    grounding.brandName ? `Brand: ${grounding.brandName}` : '',
    grounding.websiteUrl ? `Official website: ${grounding.websiteUrl}` : '',
    grounding.businessSummary ? `Business and offering: ${grounding.businessSummary}` : '',
    grounding.audienceSummary ? `Primary audience: ${grounding.audienceSummary}` : '',
    grounding.primaryCta ? `Primary CTA: ${grounding.primaryCta}` : '',
    grounding.proofPoints.length ? `Verified proof points:\n- ${grounding.proofPoints.join('\n- ')}` : '',
    grounding.writingDos.length ? `Writing rules:\n- ${grounding.writingDos.join('\n- ')}` : '',
    grounding.writingDonts.length ? `Writing restrictions:\n- ${grounding.writingDonts.join('\n- ')}` : '',
    grounding.brandColors.length ? `Verified brand colors (use these instead of inventing a palette):\n- ${grounding.brandColors.map(formatBrandColor).join('\n- ')}` : '',
    grounding.visualRules.length ? `Visual rules:\n- ${grounding.visualRules.join('\n- ')}` : '',
  ].filter(Boolean).join('\n\n');
}

export function groundPlannerOutputWithBrand(
  planner: PlannerOutput,
  grounding: BrandGrounding,
  prompt: string,
): PlannerOutput {
  if (!grounding.requiredFacts.length) return planner;
  const promptSuppliesAudience = /\b(?:target(?:ing)?|audience|for)\s+(?:is\s+|are\s+)?(?:orthodont|dent|doctor|patient|parent|owner|manager|professional|consumer|business|company|team|student|teacher|developer|marketer)/i.test(prompt);
  const promptSuppliesAction = /\b(?:book|schedule|download|install|sign\s*up|register|buy|shop|contact|call|visit|subscribe|apply\s+now|request|start\s+(?:a\s+)?trial)\b/i.test(prompt);
  const currentAudience = planner.internalBrief.audience;
  const audience = grounding.audienceSummary && (!promptSuppliesAudience || isGenericAudience(currentAudience))
    ? grounding.audienceSummary
    : currentAudience;
  const desiredAction = grounding.primaryCta && !promptSuppliesAction
    ? grounding.primaryCta
    : planner.internalBrief.desiredAction;
  const groundedGuidance = planner.campaignGuidance.startsWith('Verified brand context is authoritative')
    ? planner.campaignGuidance
    : [
      'Verified brand context is authoritative for identity, audience, offering, and CTA.',
      grounding.businessSummary ? `Offering: ${grounding.businessSummary}` : '',
      audience ? `Audience: ${audience}` : '',
      desiredAction ? `Desired action: ${desiredAction}` : '',
      `Campaign plan: ${planner.campaignGuidance}`,
    ].filter(Boolean).join(' ');

  return {
    ...planner,
    researchQuery: brandGroundedResearchQuestion(grounding, planner.researchQuery, audience),
    campaignGuidance: compact(groundedGuidance, 1200),
    internalBrief: {
      ...planner.internalBrief,
      audience,
      offerOrSubject: compact(
        grounding.businessSummary
          ? `${grounding.brandName || 'The selected brand'} — ${grounding.businessSummary}`
          : planner.internalBrief.offerOrSubject,
        700,
      ),
      desiredAction,
      confirmedFacts: uniqueStrings([
        ...grounding.requiredFacts,
        ...planner.internalBrief.confirmedFacts,
      ]).slice(0, 50),
      assumptions: planner.internalBrief.assumptions.filter((assumption) => !isSupersededAssumption(assumption, grounding)),
      restrictions: uniqueStrings([
        ...planner.internalBrief.restrictions,
        grounding.brandName ? `Do not describe ${grounding.brandName} as a different product or business category.` : '',
        grounding.audienceSummary ? 'Do not replace the verified brand audience with a generic or invented audience.' : '',
      ]).slice(0, 24),
    },
  };
}

export function groundBrandInstructionsWithBrand(
  instructions: BrandInstructions,
  grounding: BrandGrounding,
): BrandInstructions {
  if (!grounding.requiredFacts.length) return instructions;
  return {
    ...instructions,
    sourceTitle: instructions.sourceTitle || grounding.sourceTitle,
    hardRules: uniqueStrings([
      ...grounding.writingDonts,
      grounding.businessSummary ? 'Keep every campaign concept faithful to the verified business and offering.' : '',
      grounding.audienceSummary ? 'Write for the verified primary audience; do not generalize it into a broad app audience.' : '',
      grounding.websiteUrl ? `Use ${grounding.websiteUrl} as the official brand website and do not invent another destination.` : '',
      grounding.brandColors.length ? `Use only the verified brand palette in visual guidance: ${grounding.brandColors.map(formatBrandColor).join(', ')}. Do not invent unrelated named colors.` : '',
      ...instructions.hardRules,
    ]).slice(0, 24),
    toneRules: uniqueStrings([
      ...grounding.writingDos,
      ...instructions.toneRules,
    ]).slice(0, 24),
    approvedTerms: uniqueStrings([
      grounding.brandName,
      grounding.primaryCta,
      ...grounding.preferredTerms,
      ...instructions.approvedTerms,
    ]).slice(0, 24),
    prohibitedTerms: uniqueStrings([
      ...grounding.avoidedTerms,
      ...instructions.prohibitedTerms,
    ]).slice(0, 24),
    approvedFacts: uniqueStrings([
      ...grounding.requiredFacts,
      ...instructions.approvedFacts,
    ]).slice(0, 30),
  };
}

export function brandGroundedResearchQuestion(
  grounding: BrandGrounding,
  fallback: string,
  audienceFallback = '',
) {
  if (!grounding.requiredFacts.length) return compact(fallback, 220);
  const audience = grounding.audienceLabels[0]
    || grounding.audienceSummary
    || (!isGenericAudience(audienceFallback) ? audienceFallback : '')
    || 'the audience described in the client brief';
  const audienceLabel = audience.replace(/[.!?]+$/, '').trim();
  const offering = offeringLabel(grounding);
  const websiteInstruction = grounding.websiteUrl
    ? ` Verify ${domainFromUrl(grounding.websiteUrl)} first.`
    : '';
  return compact(
    `What current needs and channel behavior among ${audienceLabel} should shape this campaign for ${grounding.brandName || 'the selected brand'}${offering ? ` and its ${offering}` : ''}?${websiteInstruction}`,
    220,
  );
}

export function brandResearchQueryContext(grounding: BrandGrounding) {
  return [
    grounding.brandName ? `Brand: ${grounding.brandName}.` : '',
    grounding.websiteUrl ? `Official website: ${grounding.websiteUrl}.` : '',
    grounding.audienceLabels.length ? `Audience: ${grounding.audienceLabels.slice(0, 4).join(', ')}.` : '',
    offeringLabel(grounding) ? `Offering: ${offeringLabel(grounding)}.` : '',
  ].filter(Boolean).join(' ');
}

export function brandGroundingQualityFindings(
  pack: CampaignPack,
  grounding: BrandGrounding,
  context: BrandCampaignContext = {},
): QaFinding[] {
  if (!grounding.requiredFacts.length) return [];
  const findings = brandStrategyGroundingFindings(pack.strategy, grounding);
  const packText = normalizeSearchText(JSON.stringify(pack));
  const requiredCta = requiredCampaignCta(grounding, context);
  if (requiredCta && !containsNormalizedPhrase(packText, requiredCta)) {
    findings.push(groundingFinding(`Campaign omits the verified campaign CTA “${requiredCta}”.`, 'Use the approved campaign CTA naturally in at least one relevant asset.'));
  }
  if (requiredCta) {
    pack.googleAds.forEach((ad, index) => {
      if (containsNormalizedPhrase(JSON.stringify(ad), requiredCta)) return;
      findings.push({
        group: 'googleAds',
        index,
        severity: 'blocking',
        problem: `Google ad omits the verified campaign CTA “${requiredCta}”.`,
        suggestion: 'Use the verified next action in a headline or description.',
      });
    });
    pack.socialAds.forEach((ad, index) => {
      if (containsNormalizedPhrase(`${ad.primaryText} ${ad.headline} ${ad.description || ''}`, requiredCta)) return;
      findings.push({
        group: 'socialAds',
        index,
        severity: 'blocking',
        problem: `Paid social ad omits the reader-facing verified CTA “${requiredCta}”.`,
        suggestion: 'Put the verified CTA in the visible ad copy; the internal CTA enum alone is not enough.',
      });
    });
  }
  const officialWebsite = verifiedWebsite(grounding, context);
  if (officialWebsite) {
    pack.googleAds.forEach((ad, index) => {
      if (sameWebsite(ad.finalUrl, officialWebsite)) return;
      findings.push({
        group: 'googleAds',
        index,
        severity: 'blocking',
        problem: `Google ad does not use the verified official website ${officialWebsite}.`,
        suggestion: 'Use the official brand website as finalUrl; never invent or describe a destination page.',
      });
    });
    pack.socialAds.forEach((ad, index) => {
      if (sameWebsite(ad.destinationUrl, officialWebsite)) return;
      findings.push({
        group: 'socialAds',
        index,
        severity: 'blocking',
        problem: `Paid social ad does not use the verified official website ${officialWebsite}.`,
        suggestion: 'Use the official brand website as destinationUrl; never invent or describe a destination page.',
      });
    });
  } else {
    pack.googleAds.forEach((ad, index) => {
      if (!ad.finalUrl) return;
      findings.push({
        group: 'googleAds',
        index,
        severity: 'blocking',
        problem: 'Google ad invents a destination URL even though no official website was verified.',
        suggestion: 'Leave finalUrl empty until the user or Brand Knowledge supplies an official website.',
      });
    });
    pack.socialAds.forEach((ad, index) => {
      if (!ad.destinationUrl) return;
      findings.push({
        group: 'socialAds',
        index,
        severity: 'blocking',
        problem: 'Paid social ad invents a destination URL even though no official website was verified.',
        suggestion: 'Leave destinationUrl empty until the user or Brand Knowledge supplies an official website.',
      });
    });
  }
  const allowedColorFamilies = new Set(grounding.brandColors.flatMap((color) => colorFamilies(color.hex)));
  if (allowedColorFamilies.size) {
    pack.socialPosts.forEach((post, index) => {
      const unsupported = unsupportedNamedColors(post.visualGuide || '', allowedColorFamilies);
      if (!unsupported.length) return;
      findings.push({
        group: 'socialPosts',
        index,
        severity: 'blocking',
        problem: `Organic post visual guide invents colors outside the verified brand palette: ${unsupported.join(', ')}.`,
        suggestion: 'Use the verified brand color names and hex values supplied by Brand Knowledge.',
      });
    });
    pack.socialAds.forEach((ad, index) => {
      const unsupported = unsupportedNamedColors(ad.visualGuide || '', allowedColorFamilies);
      if (!unsupported.length) return;
      findings.push({
        group: 'socialAds',
        index,
        severity: 'blocking',
        problem: `Paid social visual guide invents colors outside the verified brand palette: ${unsupported.join(', ')}.`,
        suggestion: 'Use the verified brand color names and hex values supplied by Brand Knowledge.',
      });
    });
  } else if (grounding.brandName) {
    const aliases = brandAliases(grounding);
    pack.socialPosts.forEach((post, index) => {
      if (!unverifiedPaletteReference(post.visualGuide || '', aliases) && !namedColorMentions(post.visualGuide || '').length) return;
      findings.push({
        group: 'socialPosts',
        index,
        severity: 'blocking',
        problem: 'Organic post visual guidance supplies named colors or brand accents even though Brand Knowledge has no verified palette.',
        suggestion: 'Use neutral, project-appropriate color direction without implying it is the brand palette.',
      });
    });
    pack.socialAds.forEach((ad, index) => {
      if (!unverifiedPaletteReference(ad.visualGuide || '', aliases) && !namedColorMentions(ad.visualGuide || '').length) return;
      findings.push({
        group: 'socialAds',
        index,
        severity: 'blocking',
        problem: 'Paid social visual guidance supplies named colors or brand accents even though Brand Knowledge has no verified palette.',
        suggestion: 'Use neutral, project-appropriate color direction without implying it is the brand palette.',
      });
    });
  }
  const unmappedProducts = unmappedNamedProducts(grounding, context);
  publicClaimFields(pack).forEach(({ group, index, value }) => {
    const products = mentionedProducts(value, unmappedProducts);
    if (!products.length) return;
    findings.push({
      group,
      index,
      severity: 'blocking',
      problem: `Campaign copy assigns or implies a function for a named product without an explicit Brand Knowledge mapping: ${products.join(', ')}.`,
      suggestion: `Describe the verified capability at the ${grounding.brandName || 'brand'} platform or suite level instead.`,
    });
  });
  if (isSparseBrandGrounding(grounding)) {
    publicClaimFields(pack).forEach(({ group, index, value }) => {
      if (!unsupportedSparseBrandClaim(value, grounding, context)) return;
      findings.push({
        group,
        index,
        severity: 'blocking',
        problem: 'Campaign copy assigns an unverified feature, workflow, outcome, or quantified promise to a brand whose verified knowledge does not supply it.',
        suggestion: 'Keep the copy at the verified category, audience, and requested-action level until the missing product facts are supplied.',
      });
    });
  }
  return findings;
}

export function applyBrandGroundingDefaults(
  pack: CampaignPack,
  grounding: BrandGrounding,
  context: BrandCampaignContext = {},
): CampaignPack {
  const primaryCta = campaignCta(grounding, context);
  const unmappedProducts = unmappedNamedProducts(grounding, context);
  const officialWebsite = verifiedWebsite(grounding, context);
  const sparseBrand = isSparseBrandGrounding(grounding);
  const sanitizeClaim = (value: string | undefined) => {
    const productSafe = sanitizeUnmappedProductNames(value, unmappedProducts, grounding.brandName);
    return sparseBrand ? sanitizeSparseBrandClaims(productSafe, grounding, context) : productSafe;
  };
  const sanitizeHeadline = (value: string, index: number) => {
    const claimSafe = sanitizeClaim(value) || value;
    return sparseBrand && unsupportedSparseOutcomeHeadline(claimSafe)
      ? sparseBrandHeadline(index, grounding, context)
      : claimSafe;
  };
  const sanitizeLabel = (value: string | undefined) => {
    const productSafe = sanitizeUnmappedProductNames(value, unmappedProducts, grounding.brandName);
    if (!productSafe || !sparseBrand || !unsupportedSparseBrandClaim(productSafe, grounding, context)) return productSafe;
    return `${grounding.brandName} demo campaign`;
  };
  const sparseStrategy = sparseBrand ? buildSparseBrandStrategy(grounding, context) : null;
  return {
    ...pack,
    strategy: sparseStrategy || {
      ...pack.strategy,
      title: sanitizeLabel(pack.strategy.title) || pack.strategy.title,
      summary: sanitizeClaim(pack.strategy.summary) || pack.strategy.summary,
      objectives: pack.strategy.objectives.map((value) => sanitizeClaim(value) || value),
      contentPillars: pack.strategy.contentPillars.map((value) => sanitizeClaim(value) || value),
    },
    socialPosts: pack.socialPosts.map((post, index) => ({
      ...post,
      name: sparseBrand ? `${titleCase(post.platforms[0] || 'Social')} post ${index + 1}` : sanitizeLabel(post.name) || post.name,
      topic: sparseBrand ? `${grounding.brandName} demo introduction` : sanitizeLabel(post.topic) || post.topic,
      caption: sanitizeClaim(post.caption) || post.caption,
      creativeBrief: sparseBrand
        ? sparseEditorialInstructions(grounding, context, post.platforms.join(' or ') || 'social')
        : post.creativeBrief,
      visualGuide: sparseBrand
        ? sanitizeSparseVisualGuide(sanitizeVisualGuidePalette(post.visualGuide, grounding), grounding, context)
        : sanitizeVisualGuidePalette(post.visualGuide, grounding),
    })),
    googleAds: pack.googleAds.map((ad, adIndex) => {
      let headlines = sparseBrand
        ? sparseGoogleHeadlines(grounding, context, adIndex)
        : uniqueStrings(ad.headlines.map((value, index) => limitGoogleCopy(sanitizeHeadline(value, index), 30))).slice(0, 15);
      const descriptions = sparseBrand
        ? sparseGoogleDescriptions(grounding, context, adIndex)
        : uniqueStrings(ad.descriptions.map((value) => limitGoogleCopy(sanitizeClaim(value) || value, 90))).slice(0, 4);
      const callouts = sparseBrand
        ? sparseGoogleCallouts(grounding, context, adIndex)
        : ad.callouts
        ? uniqueStrings(ad.callouts.map((value, index) => {
          const sanitized = sanitizeClaim(value) || value;
          return limitGoogleCopy(sanitized, 25);
        })).slice(0, 10)
        : undefined;
      const hasCta = !primaryCta || containsNormalizedPhrase(JSON.stringify({ headlines, descriptions, callouts }), primaryCta);
      if (!hasCta && primaryCta.length <= 30) {
        headlines = headlines.length >= 15
          ? [...headlines.slice(0, 14), primaryCta]
          : [...headlines, primaryCta];
      }
      return {
        ...ad,
        name: sparseBrand ? `${grounding.brandName} Google ad ${adIndex + 1}` : sanitizeLabel(ad.name) || ad.name,
        topic: sparseBrand ? `${grounding.brandName} demo request` : sanitizeLabel(ad.topic) || ad.topic,
        keywords: sparseBrand ? sparseGoogleKeywords(grounding, context, adIndex) : ad.keywords,
        finalUrl: officialWebsite || undefined,
        headlines,
        descriptions,
        callouts,
      };
    }),
    socialAds: pack.socialAds.map((ad, index) => {
      const sparseCopy = sparseBrand ? sparseSocialAdCopy(index, grounding, context) : null;
      const hasCta = !primaryCta || containsNormalizedPhrase(`${ad.primaryText} ${ad.headline} ${ad.description || ''}`, primaryCta);
      const description = hasCta || !primaryCta
        ? ad.description
        : appendSentence(ad.description || '', primaryCta);
      return {
        ...ad,
        name: sparseBrand ? `${grounding.brandName} ${titleCase(ad.platform || 'social')} ad ${index + 1}` : sanitizeLabel(ad.name) || ad.name,
        topic: sparseBrand ? `${grounding.brandName} demo request` : sanitizeLabel(ad.topic) || ad.topic,
        primaryText: sparseCopy?.primaryText || sanitizeClaim(ad.primaryText) || ad.primaryText,
        headline: sparseCopy?.headline || sanitizeHeadline(ad.headline, 0),
        description: sparseCopy?.description || sanitizeClaim(description),
        visualGuide: sparseBrand
          ? sparseSocialAdVisualGuide(index, grounding, context)
          : sanitizeVisualGuidePalette(ad.visualGuide, grounding),
        cta: /\bdemo\b/i.test(primaryCta) ? 'contact_us' as const : ad.cta,
        destinationUrl: officialWebsite || undefined,
      };
    }),
    blogOutlines: pack.blogOutlines.map((outline) => ({
      ...outline,
      title: sanitizeClaim(outline.title) || outline.title,
      excerpt: sanitizeClaim(outline.excerpt) || outline.excerpt,
      metaTitle: sanitizeClaim(outline.metaTitle) || outline.metaTitle,
      metaDescription: sanitizeClaim(outline.metaDescription) || outline.metaDescription,
      outline: outline.outline.map((value) => sanitizeClaim(value) || value),
    })),
    calendar: pack.calendar.map((item, index) => ({
      ...item,
      title: sparseBrand
        ? `${grounding.brandName} ${item.type === 'google-ad' ? 'Google ad' : item.type === 'meta-ad' ? 'paid social ad' : item.type === 'blogs' ? 'blog' : 'social post'} ${index + 1}`
        : sanitizeLabel(item.title) || item.title,
    })),
  };
}

export function applyBrandGroundingToCreativeDirection(
  direction: CreativeDirection,
  grounding: BrandGrounding,
  context: BrandCampaignContext = {},
): CreativeDirection {
  const unmappedProducts = unmappedNamedProducts(grounding, context);
  const sparseBrand = isSparseBrandGrounding(grounding);
  const sanitize = (value: string) => {
    const productSafe = sanitizeUnmappedProductNames(value, unmappedProducts, grounding.brandName) || value;
    return sparseBrand
      ? sanitizeSparseBrandClaims(productSafe, grounding, context) || productSafe
      : productSafe;
  };
  const sanitizeTitle = (value: string) => (
    sparseBrand && unsupportedSparseBrandClaim(value, grounding, context)
      ? `${grounding.brandName} demo campaign`
      : sanitize(value)
  );
  if (sparseBrand) {
    const action = campaignAction(grounding, context);
    const audience = campaignAudience(context);
    const strategy = buildSparseBrandStrategy(grounding, context);
    return {
      title: strategy.title,
      centralIdea: `Introduce ${grounding.brandName} to ${audience} using audience-relevant situations and invite them to ${lowercaseFirst(action)} without assigning unverified capabilities or outcomes to the product.`,
      audienceProblem: sanitize(direction.audienceProblem),
      promise: `A relevant introduction to ${grounding.brandName} and a clear invitation to ${lowercaseFirst(action)}.`,
      keyMessages: [
        `Use the verified name ${grounding.brandName} and only its verified product-category context.`,
        `Address ${audience} without implying unverified features, workflows, results, or proof points.`,
        `Invite the audience to ${lowercaseFirst(action)}.`,
      ],
      callsToAction: [action],
      contentAngles: [
        `An audience-reality angle for ${audience}.`,
        `A direct introduction to ${grounding.brandName}.`,
        `A low-pressure invitation to ${lowercaseFirst(action)}.`,
      ],
      platformGuidance: Object.fromEntries(
        Object.keys(direction.platformGuidance).map((channel) => [
          channel,
          `Adapt the audience-relevant idea to ${channel}, keep product details at the verified category level, and use “${action}” as the next step.`,
        ]),
      ),
      strategy,
    };
  }
  return {
    ...direction,
    title: sanitizeTitle(direction.title),
    centralIdea: sanitize(direction.centralIdea),
    audienceProblem: sanitize(direction.audienceProblem),
    promise: sanitize(direction.promise),
    keyMessages: direction.keyMessages.map(sanitize),
    contentAngles: direction.contentAngles.map(sanitize),
    platformGuidance: Object.fromEntries(
      Object.entries(direction.platformGuidance).map(([channel, guidance]) => [channel, sanitize(guidance)]),
    ),
    strategy: {
      ...direction.strategy,
      title: sanitizeTitle(direction.strategy.title),
      summary: sanitize(direction.strategy.summary),
      objectives: direction.strategy.objectives.map(sanitize),
      contentPillars: direction.strategy.contentPillars.map(sanitize),
    },
  };
}

export function brandStrategyGroundingFindings(
  strategy: CampaignPack['strategy'],
  grounding: BrandGrounding,
): QaFinding[] {
  if (!grounding.requiredFacts.length) return [];
  const findings: QaFinding[] = [];
  const strategyText = normalizeSearchText(JSON.stringify(strategy));
  if (grounding.brandName && !containsNormalizedPhrase(strategyText, grounding.brandName)) {
    findings.push(groundingFinding(`Strategy does not identify the verified brand ${grounding.brandName}.`, 'Name the selected brand explicitly in the campaign strategy.'));
  }
  if (grounding.audienceAnchors.length && !containsAnyAnchor(strategyText, grounding.audienceAnchors)) {
    findings.push(groundingFinding('Strategy does not identify the verified primary audience from Brand Knowledge.', `Ground the strategy in: ${grounding.audienceSummary}.`));
  }
  if (grounding.offeringAnchors.length && !containsAnyAnchor(strategyText, grounding.offeringAnchors)) {
    findings.push(groundingFinding('Strategy does not explain the verified business or offering from Brand Knowledge.', `Ground the campaign in: ${grounding.businessSummary}.`));
  }
  return findings;
}

export function researchEvidenceScore(
  source: { title?: string; url?: string; content?: string },
  grounding: BrandGrounding,
  context: { audience?: string; offering?: string } = {},
) {
  const title = normalizeSearchText(source.title || '');
  const url = normalizeSearchText(source.url || '');
  const content = normalizeSearchText(source.content || '');
  const haystack = `${title} ${url} ${content}`;
  const officialDomain = domainFromUrl(grounding.websiteUrl);
  const contextAudienceAnchors = grounding.audienceAnchors.length
    ? []
    : meaningfulAnchors(context.audience || '', [grounding.brandName]);
  const contextOfferingAnchors = grounding.offeringAnchors.length
    ? []
    : meaningfulAnchors(context.offering || '', [grounding.brandName, context.audience || '']);
  const contextAnchors = uniqueStrings([...contextAudienceAnchors, ...contextOfferingAnchors]);
  const contextMatchCount = matchingAnchorCount(haystack, contextAnchors);
  let score = 0;
  if (officialDomain && (source.url || '').toLowerCase().includes(officialDomain)) score += 6;
  if (grounding.brandName
    && containsNormalizedPhrase(haystack, grounding.brandName)
    && (!contextAnchors.length || grounding.audienceAnchors.length > 0 || grounding.offeringAnchors.length > 0 || contextMatchCount >= 2)) score += 4;
  if (containsAnyAnchor(haystack, grounding.audienceAnchors)) score += 3;
  if (containsAnyAnchor(haystack, grounding.offeringAnchors)) score += 3;
  if (contextMatchCount >= 2) score += 3;
  else if (contextMatchCount === 1) score += 1;
  if (/\b(?:audience|instagram|facebook|google|search|social media|marketing|advertising|channel)\b/i.test(haystack)) score += 1;
  if (content.length >= 80) score += 1;
  return score;
}

export function sanitizeResearchBriefWithBrand(
  brief: ResearchBrief,
  grounding: BrandGrounding,
  context: BrandCampaignContext = {},
): ResearchBrief {
  if (!isSparseBrandGrounding(grounding)) return brief;
  const aliases = brandAliases(grounding);
  const findings = brief.findings
    .filter((finding) => !aliases.some((alias) => containsNormalizedPhrase(finding.claim, alias)))
    .map((finding) => ({
      ...finding,
      campaignUse: aliases.some((alias) => containsNormalizedPhrase(finding.campaignUse, alias))
        || unsupportedSparseBrandClaim(finding.campaignUse, grounding, context)
        ? `Use this only as audience and industry context; do not attribute an unverified feature or outcome to ${grounding.brandName}.`
        : finding.campaignUse,
    }));
  return { ...brief, findings };
}

function groundingFinding(problem: string, suggestion: string): QaFinding {
  return { group: 'strategy', index: 0, severity: 'blocking', problem, suggestion };
}

function isGenericAudience(value: string) {
  return /\b(?:broad|general|not specified|unspecified|described in the client brief|stated audience|app audience)\b/i.test(value);
}

function isSupersededAssumption(value: string, grounding: BrandGrounding) {
  if (grounding.audienceSummary && /\b(?:broad audience|no specific segment|audience (?:is|was) not specified|general audience)\b/i.test(value)) return true;
  if (grounding.businessSummary && /\b(?:no features|no proof points|features or proof points were supplied|keep claims general)\b/i.test(value)) return true;
  return false;
}

function offeringLabel(grounding: BrandGrounding) {
  const text = normalizeSearchText([grounding.businessSummary, ...grounding.proofPoints].join(' '));
  const knownPhrase = [
    'practice management tools',
    'practice management software',
    'patient intake',
    'revenue cycle management',
    'project management',
    'social media management',
    'customer relationship management',
    'learning management',
  ].find((phrase) => text.includes(phrase));
  if (knownPhrase) return knownPhrase;
  return grounding.offeringAnchors.slice(0, 3).join(' ');
}

function meaningfulAnchors(value: string, excludedValues: string[] = []) {
  const excluded = new Set(excludedValues.flatMap((item) => tokenize(item)));
  return uniqueStrings(tokenize(value).filter((token) => !excluded.has(token) && !anchorStopWords.has(token)));
}

function tokenize(value: string) {
  return normalizeSearchText(value)
    .split(' ')
    .filter((token) => token.length >= 5);
}

const anchorStopWords = new Set([
  'about', 'across', 'after', 'brand', 'business', 'company', 'digital', 'friendly', 'general', 'include',
  'including', 'integrated', 'modern', 'offering', 'offers', 'powered', 'primary', 'professional', 'provides',
  'seeking', 'software', 'solutions', 'specific', 'technology', 'their', 'tools', 'users', 'using', 'verified',
]);

function containsAnyAnchor(value: string, anchors: string[]) {
  const normalized = normalizeSearchText(value);
  return anchors.some((anchor) => new RegExp(`\\b${escapeRegExp(anchor)}(?:s|es|ing|ed)?\\b`, 'i').test(normalized));
}

function matchingAnchorCount(value: string, anchors: string[]) {
  const normalized = normalizeSearchText(value);
  return anchors.filter((anchor) => new RegExp(`\\b${escapeRegExp(anchor)}(?:s|es|ing|ed)?\\b`, 'i').test(normalized)).length;
}

function containsNormalizedPhrase(value: string, phrase: string) {
  const normalizedValue = normalizeSearchText(value).replace(/\s+/g, '');
  const normalizedPhrase = normalizeSearchText(phrase).replace(/\s+/g, '');
  return Boolean(normalizedPhrase && normalizedValue.includes(normalizedPhrase));
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function markdownLabel(markdown: string, label: string) {
  return compact(markdownLabelBlock(markdown, label).replace(/^[-*]\s+/gm, '').trim(), 1200);
}

function markdownLabelBlock(markdown: string, label: string) {
  const match = markdown.match(new RegExp(`(?:^|\\r?\\n)\\s*(?:[-*]\\s+)?\\*\\*${escapeRegExp(label)}:\\*\\*\\s*(?:\\r?\\n)?([\\s\\S]*?)(?=\\r?\\n\\s*(?:(?:[-*]\\s+)?\\*\\*[^*\\r\\n]+:\\*\\*|##\\s)|$)`, 'i'));
  return (match?.[1] || '').trim();
}

function markdownListAfterLabel(markdown: string, label: string) {
  const block = markdownLabelBlock(markdown, label);
  return uniqueStrings(block.split(/\r?\n/).map((line) => line.replace(/^[-*]\s+/, '').trim()));
}

function markdownListUnderHeading(markdown: string, heading: string) {
  const match = markdown.match(new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^##\\s|$)`, 'im'));
  return uniqueStrings((match?.[1] || '').split(/\r?\n/).map((line) => line.replace(/^[-*\d.)\s]+/, '').trim()));
}

function firstOfficialWebsite(markdown: string) {
  const urls = markdown.match(/https?:\/\/[^\s)\]]+/gi) || [];
  return urls.find((url) => !/linkedin|instagram|twitter|facebook|youtube/i.test(url)) || '';
}

function collectNestedStringArray(input: unknown, targetKey: string): string[] {
  if (Array.isArray(input)) return input.flatMap((item) => collectNestedStringArray(item, targetKey));
  if (!input || typeof input !== 'object') return [];
  const record = input as Record<string, unknown>;
  return Object.entries(record).flatMap(([key, value]) => key === targetKey
    ? stringArray(value)
    : collectNestedStringArray(value, targetKey));
}

function canonicalCta(value: string, inferIntent = false) {
  const normalized = compact(value, 500);
  if (!normalized) return '';
  if (/\bbook(?:\s+a)?\s+(?:demo|discovery call)\b/i.test(normalized)) return 'Book a Demo';
  if (/\brequest(?:\s+a)?\s+(?:demo|discovery call)\b/i.test(normalized)) return 'Request a Demo';
  if (/\bschedule(?:\s+(?:a|your))?\s+(?:demo|call|consultation|appointment)\b/i.test(normalized)) {
    const target = normalized.match(/\bschedule(?:\s+(?:a|your))?\s+(demo|call|consultation|appointment)\b/i)?.[1] || 'call';
    return `Schedule a ${capitalizeFirst(target)}`;
  }
  if (/\bcontact(?:\s+us)?\b/i.test(normalized)) return 'Contact Us';
  if (/\bget started\b/i.test(normalized)) return 'Get Started';
  if (/\bstart(?:\s+a)?\s+(?:free\s+)?trial\b/i.test(normalized)) return 'Start a Trial';
  if (/\bsign up\b/i.test(normalized)) return 'Sign Up';
  if (/\bdownload(?:\s+the\s+app)?\b/i.test(normalized)) return 'Download the App';
  if (/\bshop now\b/i.test(normalized)) return 'Shop Now';
  if (/\blearn more\b/i.test(normalized)) return 'Learn More';
  if (/\bapply now\b/i.test(normalized)) return 'Apply Now';
  if (!inferIntent) return '';
  if (/\b(?:shop|buy|purchase|order)\b|\bbrowse\b[^.!?]{0,80}\bproducts?\b/i.test(normalized)) return 'Shop Now';
  if (/\b(?:visit|click|website|browse|explore|discover|read)\b/i.test(normalized)) return 'Learn More';
  return '';
}

function campaignCta(grounding: BrandGrounding, context: BrandCampaignContext) {
  return canonicalCta(grounding.primaryCta)
    || canonicalCta(context.desiredAction || '', true);
}

function requiredCampaignCta(grounding: BrandGrounding, context: BrandCampaignContext) {
  return canonicalCta(grounding.primaryCta)
    || canonicalCta(context.desiredAction || '');
}

function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function sameWebsite(candidate: string | undefined, official: string) {
  if (!candidate) return false;
  const candidateDomain = domainFromUrl(candidate);
  const officialDomain = domainFromUrl(official);
  return Boolean(candidateDomain && officialDomain && candidateDomain === officialDomain);
}

function normalizeHexColor(value: string) {
  const match = value.trim().match(/^#?([a-f0-9]{6})$/i);
  return match ? `#${match[1].toUpperCase()}` : '';
}

function formatBrandColor(color: { name: string; role: string; hex: string }) {
  const label = color.name || color.role || 'Brand color';
  return `${label}${color.role && color.role.toLowerCase() !== label.toLowerCase() ? ` (${color.role})` : ''}: ${color.hex}`;
}

function colorFamilies(hex: string) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return [];
  const red = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  const green = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (max <= 0.12) return ['black'];
  if (delta <= 0.08) return max >= 0.9 ? ['white', 'gray'] : ['gray'];
  let hue = 0;
  if (max === red) hue = 60 * (((green - blue) / delta) % 6);
  else if (max === green) hue = 60 * (((blue - red) / delta) + 2);
  else hue = 60 * (((red - green) / delta) + 4);
  if (hue < 0) hue += 360;
  if (hue < 15 || hue >= 345) return ['red'];
  if (hue < 45) return ['orange'];
  if (hue < 70) return ['yellow'];
  if (hue < 165) return ['green'];
  if (hue < 195) return ['cyan'];
  if (hue < 255) return ['blue'];
  if (hue < 290) return ['purple'];
  if (hue < 345) return ['pink'];
  return [];
}

function unsupportedNamedColors(value: string, allowed: Set<string>) {
  const aliases: Record<string, string> = { grey: 'gray', violet: 'purple', teal: 'cyan' };
  const mentioned = Array.from(value.toLowerCase().matchAll(/\b(red|orange|yellow|green|teal|cyan|blue|purple|violet|pink|brown|black|white|gray|grey)s?\b/g))
    .map((match) => aliases[match[1]] || match[1]);
  return uniqueStrings(mentioned.filter((color) => !allowed.has(color)));
}

function unmappedNamedProducts(grounding: BrandGrounding, context: BrandCampaignContext = {}) {
  const sources = grounding.proofPoints;
  const brandToken = normalizeSearchText(grounding.brandName).replace(/\s+/g, '');
  const candidates = uniqueStrings(sources.flatMap((source) => (
    Array.from(source.matchAll(/\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b/g), (match) => match[0])
  ))).filter((candidate) => normalizeSearchText(candidate).replace(/\s+/g, '') !== brandToken);

  return candidates.filter((candidate) => !promptExplicitlyMapsNamedProduct(context.prompt || '', candidate) && !sources.some((source) => {
    const sentences = source.split(/(?<=[.!?])\s+/);
    return sentences.some((sentence) => {
      if (!new RegExp(`\\b${escapeRegExp(candidate)}\\b`, 'i').test(sentence)) return false;
      const namedProducts = candidates.filter((product) => new RegExp(`\\b${escapeRegExp(product)}\\b`, 'i').test(sentence));
      if (namedProducts.length !== 1) return false;
      return new RegExp(`\\b${escapeRegExp(candidate)}\\b\\s*(?:is|are|:|[-–—]|helps?|handles?|supports?|provides?|manages?|automates?|verifies?|collects?|creates?|tracks?|offers?)\\b`, 'i').test(sentence);
    });
  }));
}

function promptExplicitlyMapsNamedProduct(prompt: string, product: string) {
  const productIndex = prompt.toLowerCase().indexOf(product.toLowerCase());
  if (productIndex < 0) return false;
  const nearby = prompt.slice(Math.max(0, productIndex - 80), productIndex + 1800);
  const capabilitySignals = nearby.match(/\b(?:create|assign|confirm|track|duplicate|adapt|scale|standardize|collaborate|share|search|manage|automate|support|build)\w*\b/gi) || [];
  const introducesDetails = /\b(?:details?|features?|capabilities?|built\s+for)\b/i.test(nearby);
  return capabilitySignals.length >= 2 || (introducesDetails && capabilitySignals.length >= 1);
}

function sanitizeUnmappedProductNames(value: string | undefined, products: string[], brandName: string) {
  if (!value || !products.length || !brandName) return value;
  const mentioned = mentionedProducts(value, products);
  if (!mentioned.length) return value;

  const token = '__VERIFIED_BRAND_PRODUCT__';
  let sanitized = value;
  mentioned.forEach((product) => {
    sanitized = sanitized.replace(new RegExp(`\\b${escapeRegExp(product)}\\b`, 'gi'), token);
  });
  const productList = new RegExp(`${token}(?:\\s*,\\s*${token})*(?:\\s*,?\\s*(?:and|&)\\s*${token})`, 'g');
  sanitized = sanitized.replace(productList, `${brandName} tools`);
  sanitized = sanitized.replace(new RegExp(token, 'g'), brandName);
  return sanitized;
}

function mentionedProducts(value: string, products: string[]) {
  return products.filter((product) => new RegExp(`\\b${escapeRegExp(product)}\\b`, 'i').test(value));
}

function publicClaimFields(pack: CampaignPack): Array<{
  group: QaFinding['group'];
  index: number;
  value: string;
}> {
  return [
    ...pack.socialPosts.map((post, index) => ({ group: 'socialPosts' as const, index, value: post.caption })),
    ...pack.googleAds.flatMap((ad, index) => [
      ...ad.headlines,
      ...ad.descriptions,
      ...(ad.callouts || []),
    ].map((value) => ({ group: 'googleAds' as const, index, value }))),
    ...pack.socialAds.flatMap((ad, index) => [ad.primaryText, ad.headline, ad.description || '']
      .map((value) => ({ group: 'socialAds' as const, index, value }))),
    ...pack.blogOutlines.flatMap((outline, index) => [
      outline.title,
      outline.excerpt,
      outline.metaTitle,
      outline.metaDescription,
      ...outline.outline,
    ].map((value) => ({ group: 'blogOutlines' as const, index, value }))),
  ];
}

function verifiedWebsite(grounding: BrandGrounding, context: BrandCampaignContext) {
  if (grounding.websiteUrl) return grounding.websiteUrl;
  return context.prompt?.match(/https?:\/\/[^\s)\]]+/i)?.[0]?.replace(/[.,;!?]+$/, '') || '';
}

function isSparseBrandGrounding(grounding: BrandGrounding) {
  return Boolean(grounding.brandName && !grounding.businessSummary && grounding.proofPoints.length === 0);
}

function unsupportedSparseBrandClaim(
  value: string,
  grounding: BrandGrounding,
  context: BrandCampaignContext,
) {
  if (!value.trim()) return false;
  const verifiedText = [
    grounding.businessSummary,
    ...grounding.proofPoints,
    ...(context.confirmedFacts || []),
    context.prompt || '',
  ].filter(Boolean).join(' ');
  const quantitativeClaims = Array.from(value.matchAll(/\b\d+(?:\.\d+)?\s*(?:%|percent|minutes?|hours?|days?|weeks?|months?|years?|x)\b/gi), (match) => match[0]);
  if (quantitativeClaims.some((claim) => !containsNormalizedPhrase(verifiedText, claim))) return true;
  if (unsupportedSparseOutcomeClaim(value, verifiedText)) return true;

  const brandPattern = brandAliases(grounding).map(escapeRegExp).join('|');
  const capabilityVerb = '(?:brings?|handles?|puts?|keeps?|tracks?|manages?|automates?|coordinates?|connects?|centralizes?|organizes?|provides?|supports?|fits?|simplif(?:y|ies)|reduces?|improves?|streamlines?|gives?|enables?|lets?|is\\s+(?:built|designed)\\s+(?:to|for))';
  const productClaim = new RegExp(`(?:\\b(?:${brandPattern})\\b|\\b(?:software|platform|app|tool|solution|saas)\\b).{0,90}\\b${capabilityVerb}\\b`, 'i');
  const implicitBuiltForClaim = /^\s*built\s+for\b/i.test(value);
  if (!productClaim.test(value) && !implicitBuiltForClaim) return false;

  const excluded = [grounding.brandName, context.audience || '', context.desiredAction || ''];
  const claimAnchors = meaningfulAnchors(value, excluded).filter((anchor) => !sparseClaimStopWords.has(anchor));
  const verifiedAnchors = new Set(meaningfulAnchors(verifiedText, excluded));
  return claimAnchors.filter((anchor) => verifiedAnchors.has(anchor)).length < 2;
}

function unsupportedSparseOutcomeClaim(value: string, verifiedText: string) {
  const patterns = [
    /\b(?:less|more|faster|simpler|easier|clearer|better|calmer)\s+(?:[\w-]+\s+){0,3}(?:coordination|clarity|oversight|chasing|juggling|control|friction|confusion|noise|complexity|admin|work|workflow|projects?|decisions?|updates?|chaos|risk|delays?|errors?|time|effort)\b/gi,
    /\b(?:support(?:s|ed|ing)?|enable(?:s|d|ing)?|deliver(?:s|ed|ing)?|provide(?:s|d|ing)?)\s+(?:a\s+)?(?:clearer|better|faster|simpler|easier|calmer|organized)\b(?:\s+[\w-]+){0,4}/gi,
    /\bkeep(?:s|ing)?\s+(?:the\s+)?(?:[\w-]+\s+){0,3}moving\b/gi,
    /\b(?:one place for everything|all in one place|everything in one place)\b/gi,
    /\b(?:clearer|simpler|easier|better)\s+way\s+to\s+(?:stay\s+)?(?:organized|coordinate|manage|work)\b/gi,
    /\b(?:bring(?:s|ing)?|give(?:s|n|ing)?|provide(?:s|d|ing)?)\s+(?:a\s+)?sense\s+of\s+control\b/gi,
    /\borganized\s+(?:[\w-]+\s+){0,3}(?:coordination|oversight|workflow|work|operations?)\b/gi,
    /\b(?:organiz(?:e|es|ed|ing)|coordinat(?:e|es|ed|ing)|centraliz(?:e|es|ed|ing)|streamlin(?:e|es|ed|ing)|simplif(?:y|ies|ied|ying)|improv(?:e|es|ed|ing)|reduc(?:e|es|ed|ing)|automat(?:e|es|ed|ing))\s+(?:[\w-]+\s+){0,4}(?:coordination|oversight|workflow|work|operations?|updates?|projects?|clarity|chasing)\b/gi,
  ];
  const matches = patterns.flatMap((pattern) => Array.from(value.matchAll(pattern), (match) => match[0]));
  return matches.some((match) => !containsNormalizedPhrase(verifiedText, match));
}

function sanitizeSparseBrandClaims(
  value: string | undefined,
  grounding: BrandGrounding,
  context: BrandCampaignContext,
) {
  if (!value || !unsupportedSparseBrandClaim(value, grounding, context)) return value;
  const safeSentence = sparseBrandSafeSentence(grounding, context);
  const sentences = value.split(/(?<=[.!?])\s+/).filter(Boolean);
  const sanitized = sentences.map((sentence) => (
    unsupportedSparseBrandClaim(sentence, grounding, context) ? safeSentence : sentence
  ));
  const joined = sanitized.filter((sentence, index) => index === 0 || sentence !== sanitized[index - 1]).join(' ');
  return unsupportedSparseBrandClaim(joined, grounding, context) ? safeSentence : joined;
}

function sparseBrandSafeSentence(grounding: BrandGrounding, context: BrandCampaignContext) {
  const action = campaignCta(grounding, context) || 'Explore the product';
  const audience = (context.audience || 'your team').replace(/[.!?]+$/, '').trim();
  return `${action.charAt(0).toUpperCase()}${action.slice(1)} to explore ${grounding.brandName} and evaluate it for ${audience}.`;
}

function unsupportedSparseOutcomeHeadline(value: string) {
  return /\b(?:less|more|faster|simpler|easier|clearer|better|save|reduce|improve|streamline|centralize|organize|one\s+place|everything|keep\s+\w+\s+moving)\b/i.test(value);
}

function sparseBrandHeadline(index: number, grounding: BrandGrounding, context: BrandCampaignContext) {
  const action = campaignCta(grounding, context) || 'Explore the Product';
  const candidates = uniqueStrings([
    grounding.brandName,
    action,
    `Explore ${grounding.brandName}`,
    `See ${grounding.brandName}`,
    `${grounding.brandName} Demo`,
    'Product Demo',
    'Software Demo',
    'Evaluate the Software',
  ]);
  return candidates[index % candidates.length] || grounding.brandName;
}

function sparseEditorialInstructions(
  grounding: BrandGrounding,
  context: BrandCampaignContext,
  platform: string,
) {
  const action = campaignAction(grounding, context);
  const audience = campaignAudience(context);
  return `Write a creative, audience-appropriate ${platform} post for ${audience}. Keep ${grounding.brandName} at the verified product-category level, avoid unverified capabilities or outcomes, and close with “${action}.”`;
}

function buildSparseBrandStrategy(
  grounding: BrandGrounding,
  context: BrandCampaignContext,
): CampaignPack['strategy'] {
  const audience = campaignAudience(context);
  const action = campaignAction(grounding, context);
  const channels = uniqueStrings(context.requestedChannels || []).slice(0, 3);
  const tone = uniqueStrings(context.tone || [])
    .map((value) => value.replace(/[.!?]+$/, '').trim())
    .filter(Boolean)
    .slice(0, 2);
  const channelText = channels.length ? channels.join(', ') : 'the requested campaign channels';
  const toneText = tone.length ? tone.join('; ') : 'the tone requested in the client brief';
  return {
    title: `${grounding.brandName} demo campaign`,
    summary: `This campaign introduces ${grounding.brandName} to ${audience} through ${channelText}. It follows the requested tone (${toneText}) and encourages the requested action: ${action}. Because Brand Knowledge supplies no verified capabilities or proof points, the campaign stays at the product-category level and does not invent features, outcomes, a website, or a brand palette.`,
    objectives: [
      `Introduce ${grounding.brandName} to ${audience}.`,
      `Encourage the audience to ${lowercaseFirst(action)}.`,
      `Use ${channelText} without adding unrequested deliverables.`,
      'Keep product claims limited to facts verified by the user or Brand Knowledge.',
    ],
    contentPillars: [
      `Work realities relevant to ${audience}.`,
      toneText,
      'Verified product-category introduction',
      `Direct invitation to ${lowercaseFirst(action)}`,
    ],
  };
}

function sparseGoogleHeadlines(grounding: BrandGrounding, context: BrandCampaignContext, adIndex: number) {
  const action = campaignAction(grounding, context);
  const category = sparseProductCategory(grounding, context);
  const brandSet = [
    grounding.brandName,
    action,
    `Explore ${grounding.brandName}`,
    `See ${grounding.brandName}`,
    `${grounding.brandName} Demo`,
    'Product Demo',
    'Software Demo',
    'Evaluate the Software',
    'Request Product Demo',
    'Explore the Product',
  ];
  const categorySet = [
    `${category} Demo`,
    action,
    `Explore ${category}`,
    `See ${category}`,
    `Compare ${category}`,
    `Evaluate ${category}`,
    'For Your Team',
    'Discuss Your Requirements',
    'Review Product Options',
    'Compare Software Options',
  ];
  return uniqueStrings((adIndex % 2 ? categorySet : brandSet).map((value) => limitGoogleCopy(value, 30))).slice(0, 15);
}

function sparseGoogleDescriptions(grounding: BrandGrounding, context: BrandCampaignContext, adIndex: number) {
  const action = campaignAction(grounding, context);
  const audience = campaignAudience(context);
  const category = sparseProductCategory(grounding, context);
  const brandSet = [
    fitCompleteGoogleDescription(
      `${action} to explore ${grounding.brandName}.`,
      `${action}. Explore the product.`,
    ),
    fitCompleteGoogleDescription(
      `Evaluate ${grounding.brandName} for your team through a product demo.`,
      'Evaluate the product for your team through a demo.',
    ),
    fitCompleteGoogleDescription(
      `For ${audience}. ${action}.`,
      `For the audience in your brief. ${action}.`,
    ),
    fitCompleteGoogleDescription(
      `Talk with the team about ${grounding.brandName}. ${action}.`,
      `Talk with the team about the product. ${action}.`,
    ),
  ];
  const categorySet = [
    fitCompleteGoogleDescription(
      `Explore a ${category} demo for your team.`,
      `${action}. Explore the product.`,
    ),
    fitCompleteGoogleDescription(
      `For ${audience}.`,
      `For the audience in your brief. ${action}.`,
    ),
    fitCompleteGoogleDescription(
      `Compare ${grounding.brandName} with your requirements. ${action}.`,
      'Evaluate the product for your team through a demo.',
    ),
    fitCompleteGoogleDescription(
      'Discuss your team’s software requirements in a product conversation.',
      'Discuss your team’s requirements in a product conversation.',
    ),
  ];
  return uniqueStrings(adIndex % 2 ? categorySet : brandSet).slice(0, 4);
}

function sparseGoogleCallouts(grounding: BrandGrounding, context: BrandCampaignContext, adIndex: number) {
  const primary = [
    campaignAction(grounding, context),
    'Product demo',
    'For your team',
    'Explore the product',
  ];
  const alternate = [
    campaignAction(grounding, context),
    'Discuss your needs',
    'Compare options',
    'For decision-makers',
  ];
  return uniqueStrings((adIndex % 2 ? alternate : primary).map((value) => limitGoogleCopy(value, 25))).slice(0, 10);
}

function sparseGoogleKeywords(grounding: BrandGrounding, context: BrandCampaignContext, adIndex: number) {
  const audience = normalizeSearchText(context.audience || '');
  const category = sparseProductCategory(grounding, context);
  const brandKeywords = [
    grounding.brandName,
    `${grounding.brandName} demo`,
  ];
  const categoryKeywords = [
    `${category} demo`,
    category,
    audience.includes('project manager') ? `${category} project managers` : '',
    audience.includes('site operations') ? `${category} site operations` : '',
  ];
  return uniqueStrings(adIndex % 2 ? categoryKeywords : brandKeywords);
}

function sparseProductCategory(grounding: BrandGrounding, context: BrandCampaignContext) {
  const source = `${grounding.brandName} ${context.offerOrSubject || ''}`.replace(/[.!?]+$/, '').trim();
  const explicit = source.match(/\b(?:[a-z][a-z0-9-]*\s+){0,2}(?:saas|software|platform|app|application|tool|solution)\b/i)?.[0] || '';
  const withoutBrandLead = explicit.replace(new RegExp(`^${escapeRegExp(grounding.brandName.split(/\s+/)[0] || '')}\\s+`, 'i'), '').trim();
  return titleCase(withoutBrandLead || 'software').replace(/\bsaas\b/i, 'SaaS');
}

function sparseSocialAdCopy(index: number, grounding: BrandGrounding, context: BrandCampaignContext) {
  const action = campaignAction(grounding, context);
  const audience = campaignAudienceSegments(context).map(capitalizeFirst);
  if (index % 2) {
    return {
      primaryText: `Another browser tab just joined the meeting. ${audience[1] || audience[0]} can take a closer look at ${grounding.brandName}. ${action}.`,
      headline: action,
      description: 'A direct software introduction.',
    };
  }
  return {
    primaryText: `${audience[0]} already have enough moving parts. Meet ${grounding.brandName}. ${action}.`,
    headline: grounding.brandName,
    description: 'A product demo for your team.',
  };
}

function campaignAudienceSegments(context: BrandCampaignContext) {
  const segments = campaignAudience(context)
    .split(/\s*(?:,|;|\band\b|\bor\b)\s*/i)
    .map((value) => value.trim())
    .filter(Boolean);
  return segments.length ? segments : ['Your team'];
}

function capitalizeFirst(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function sparseSocialAdVisualGuide(index: number, grounding: BrandGrounding, context: BrandCampaignContext) {
  const scene = index % 2
    ? 'Show a small target-audience team in an authentic work setting with one clear focal interaction.'
    : 'Show one member of the target audience reviewing work in an authentic setting with a clear focal subject.';
  return `${scene} Use neutral, project-appropriate colors and a clean feed-native composition. Use a 1:1 or 4:5 aspect ratio. Keep any text overlay to “${grounding.brandName}” or “${campaignAction(grounding, context)}”; do not imply a feature or outcome.`;
}

function sanitizeSparseVisualGuide(
  value: string | undefined,
  grounding: BrandGrounding,
  context: BrandCampaignContext,
) {
  if (!value) return value;
  const safeOverlay = `Keep overlay text to “${grounding.brandName}” or “${campaignAction(grounding, context)}”; do not imply a feature or outcome.`;
  const sentences = value.split(/(?<=[.!?])\s+/).filter(Boolean).map((sentence) => (
    unsupportedSparseBrandClaim(sentence, grounding, context)
      || (/\boverlay\b/i.test(sentence) && /\b(?:built for|simplif|streamlin|improv|reduc|clearer|better|faster|easier)\w*/i.test(sentence))
      ? safeOverlay
      : sentence
  ));
  return sentences.filter((sentence, index) => index === 0 || sentence !== sentences[index - 1]).join(' ');
}

function campaignAudience(context: BrandCampaignContext) {
  return (context.audience || 'the audience in the client brief').replace(/[.!?]+$/, '').trim();
}

function campaignAction(grounding: BrandGrounding, context: BrandCampaignContext) {
  return campaignCta(grounding, context) || 'Explore the product';
}

function lowercaseFirst(value: string) {
  return value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value;
}

function titleCase(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}` : value;
}

function fitCompleteGoogleDescription(value: string, fallback: string) {
  const normalize = (input: string) => `${input.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '')}.`;
  const candidate = normalize(value);
  if (candidate.length <= 90) return candidate;
  const safeFallback = normalize(fallback);
  if (safeFallback.length <= 90) return safeFallback;
  return 'Explore the product and use the next step supplied in the client brief.';
}

function brandAliases(grounding: BrandGrounding) {
  const firstToken = grounding.brandName.split(/\s+/)[0]?.trim() || '';
  return uniqueStrings([
    grounding.brandName,
    firstToken.length >= 3 ? firstToken : '',
  ]);
}

function unverifiedPaletteReference(value: string, aliases: string[]) {
  const aliasPattern = aliases.map(escapeRegExp).join('|');
  return /\bbrand\s+(?:colors?|palette|accents?)\b/i.test(value)
    || Boolean(aliasPattern && new RegExp(`\\b(?:${aliasPattern})\\s+(?:colors?|palette|accents?)\\b`, 'i').test(value));
}

function sanitizeUnverifiedPalette(value: string | undefined, grounding: BrandGrounding) {
  if (!value || grounding.brandColors.length) return value;
  const aliases = brandAliases(grounding);
  if (!unverifiedPaletteReference(value, aliases) && !namedColorMentions(value).length) return value;
  const safeSentence = 'Use neutral, project-appropriate colors.';
  const sentences = value.split(/(?<=[.!?])\s+/).filter(Boolean);
  const sanitized = sentences.map((sentence) => (
    unverifiedPaletteReference(sentence, aliases) || namedColorMentions(sentence).length ? safeSentence : sentence
  ));
  return sanitized.filter((sentence, index) => index === 0 || sentence !== sanitized[index - 1]).join(' ');
}

function sanitizeVisualGuidePalette(value: string | undefined, grounding: BrandGrounding) {
  if (!value) return value;
  if (!grounding.brandColors.length) return sanitizeUnverifiedPalette(value, grounding);

  const allowedColorFamilies = new Set(grounding.brandColors.flatMap((color) => colorFamilies(color.hex)));
  if (!unsupportedNamedColors(value, allowedColorFamilies).length) return value;

  const palette = grounding.brandColors.map(formatBrandColor).join(', ');
  const safeSentence = `Use only the verified brand palette: ${palette}.`;
  const sentences = value.split(/(?<=[.!?])\s+/).filter(Boolean);
  const sanitized = sentences.map((sentence) => (
    unsupportedNamedColors(sentence, allowedColorFamilies).length ? safeSentence : sentence
  ));
  return sanitized.filter((sentence, index) => index === 0 || sentence !== sanitized[index - 1]).join(' ');
}

function namedColorMentions(value: string) {
  return uniqueStrings(Array.from(
    value.toLowerCase().matchAll(/\b(red|orange|yellow|green|teal|cyan|blue|purple|violet|pink|brown|black|white|gray|grey)s?\b/g),
    (match) => match[1],
  ));
}

const sparseClaimStopWords = new Set([
  'brings', 'bring', 'handles', 'handle', 'puts', 'keeps', 'keep', 'tracks', 'track', 'manages', 'manage',
  'automates', 'automate', 'coordinates', 'coordinate', 'connects', 'connect', 'centralizes', 'centralize',
  'organizes', 'organize', 'provides', 'provide', 'supports', 'support', 'fits', 'simplifies', 'simplify',
  'reduces', 'reduce', 'improves', 'improve', 'streamlines', 'streamline', 'gives', 'give', 'enables', 'enable',
  'lets', 'built', 'designed', 'product', 'platform', 'solution', 'saas', 'software', 'workflow', 'workflows',
]);

function compact(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function appendSentence(value: string, sentence: string) {
  const base = value.trim().replace(/[.!?]+$/, '');
  const addition = sentence.trim().replace(/[.!?]+$/, '');
  return [base, addition].filter(Boolean).map((part) => `${part}.`).join(' ');
}

function limitGoogleCopy(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const candidate = normalized.slice(0, maxLength);
  const wordBoundary = candidate.lastIndexOf(' ');
  return (wordBoundary >= Math.floor(maxLength * 0.65) ? candidate.slice(0, wordBoundary) : candidate)
    .replace(/[\s,;:|/\\-]+$/g, '')
    .trim();
}

function stringValue(input: unknown) {
  if (typeof input === 'string') return input.trim();
  if (typeof input === 'number' || typeof input === 'boolean') return String(input);
  return '';
}

function stringArray(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(stringValue).filter(Boolean);
  const value = stringValue(input);
  return value ? [value] : [];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function meaningfulBrandValues(values: string[]) {
  return uniqueStrings(values).filter((value) => Boolean(meaningfulBrandValue(value)));
}

function meaningfulBrandValue(value: string) {
  const normalized = value.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (/^(?:not\s+(?:yet\s+)?defined|undefined|none\s+provided|n\/?a|no\s+[^.!]{0,100}\s+(?:provided|defined|available))(?:\b|[.!:(])/i.test(normalized)) return '';
  return normalized;
}

function firstNonEmpty(...values: string[]) {
  return values.find(Boolean) || '';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
