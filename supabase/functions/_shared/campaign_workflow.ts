import { normalizeCampaignPack, type CampaignPack } from './campaign_pack.ts';
import type { BrandInstructions, ContentPatch, InternalBrief, QaFinding } from './agent_contracts.ts';
import { extractRequestedChannelConstraints, type DeliverableContract } from './deliverable_contract.ts';

type CalendarType = CampaignPack['calendar'][number]['type'];
export type GeneratedCampaignSectionKey = 'socialPosts' | 'googleAds' | 'socialAds' | 'blogOutlines';

const editableFields: Record<ContentPatch['group'], Set<string>> = {
  socialPosts: new Set(['name', 'topic', 'caption', 'platforms', 'creativeBrief', 'visualGuide']),
  googleAds: new Set(['name', 'topic', 'keywords', 'headlines', 'descriptions', 'path1', 'path2', 'callouts']),
  socialAds: new Set(['name', 'topic', 'platform', 'primaryText', 'headline', 'description', 'visualGuide', 'cta']),
  blogOutlines: new Set(['title', 'excerpt', 'metaTitle', 'metaDescription', 'keywords', 'outline']),
};

export function buildCampaignCalendar(pack: CampaignPack, count: number, startDate: string): CampaignPack['calendar'] {
  const groups: Array<Array<{ title: string; type: CalendarType }>> = [
    pack.socialPosts.map((item, index) => ({ title: item.name || item.topic || `Social post ${index + 1}`, type: 'socials' as CalendarType })),
    pack.googleAds.map((item, index) => ({ title: item.name || item.headlines[0] || `Google ad ${index + 1}`, type: 'google-ad' as CalendarType })),
    pack.socialAds.map((item, index) => ({ title: item.name || item.headline || `Paid social ad ${index + 1}`, type: 'meta-ad' as CalendarType })),
    pack.blogOutlines.map((item, index) => ({ title: item.title || `Blog outline ${index + 1}`, type: 'blogs' as CalendarType })),
  ].filter((group) => group.length > 0);

  if (count <= 0 || groups.length === 0) return [];

  const ordered: Array<{ title: string; type: CalendarType }> = [];
  const cursors = groups.map(() => 0);
  while (ordered.length < count && groups.some((group, index) => cursors[index] < group.length)) {
    for (let groupIndex = 0; groupIndex < groups.length && ordered.length < count; groupIndex += 1) {
      const item = groups[groupIndex][cursors[groupIndex]];
      if (!item) continue;
      ordered.push(item);
      cursors[groupIndex] += 1;
    }
  }

  let repeatIndex = 0;
  while (ordered.length < count) {
    const source = ordered[repeatIndex % ordered.length];
    ordered.push({ ...source, title: `${source.title} — follow-up` });
    repeatIndex += 1;
  }

  return ordered.map((item, index) => ({
    ...item,
    date: addDays(startDate, index),
  }));
}

export function limitCampaignPackToContract(pack: CampaignPack, contract: DeliverableContract): CampaignPack {
  return {
    ...pack,
    socialPosts: pack.socialPosts.slice(0, contract.socialPosts),
    googleAds: pack.googleAds.slice(0, contract.googleAds),
    socialAds: pack.socialAds.slice(0, contract.socialAds),
    blogOutlines: pack.blogOutlines.slice(0, contract.blogOutlines),
    calendar: pack.calendar.slice(0, contract.calendarItems),
  };
}

export function campaignSectionMinimumCount(contract: DeliverableContract, key: GeneratedCampaignSectionKey) {
  const target = contract[key];
  if (target <= 0) return 0;
  return contract.explicitCounts ? target : 1;
}

export function campaignCalendarCount(pack: CampaignPack, contract: DeliverableContract) {
  if (contract.explicitCounts) return contract.calendarItems;
  const generatedItems = pack.socialPosts.length
    + pack.googleAds.length
    + pack.socialAds.length
    + pack.blogOutlines.length;
  return Math.min(contract.calendarItems, generatedItems);
}

export function alignCampaignPackToRequestedPlatforms(pack: CampaignPack, prompt: string): CampaignPack {
  const requested = extractRequestedChannelConstraints(prompt);
  if (!requested.organicSocial.length && !requested.paidSocial.length) return pack;

  return normalizeCampaignPack({
    ...pack,
    socialPosts: pack.socialPosts.map((post, index) => {
      if (!requested.organicSocial.length) return post;
      const matchingPlatforms = post.platforms.filter((platform) => requested.organicSocial.includes(platform));
      const platforms = matchingPlatforms.length
        ? matchingPlatforms
        : [requested.organicSocial[index % requested.organicSocial.length]];
      return {
        ...post,
        platforms,
        name: alignOrganicChannelText(post.name, platforms[0]) || post.name,
        topic: alignOrganicTopic(post.topic, platforms[0]),
        caption: alignOrganicChannelText(post.caption, platforms[0]) || post.caption,
        creativeBrief: alignOrganicChannelText(post.creativeBrief, platforms[0]),
        visualGuide: alignOrganicChannelText(post.visualGuide, platforms[0]),
      };
    }),
    socialAds: pack.socialAds.map((ad, index) => {
      const platform = requested.paidSocial.length && !requested.paidSocial.includes(ad.platform)
        ? requested.paidSocial[index % requested.paidSocial.length]
        : ad.platform;
      return {
        ...ad,
        platform,
        name: alignPaidSocialChannelText(ad.name, platform) || ad.name,
        topic: alignPaidSocialChannelText(ad.topic, platform) || ad.topic,
        primaryText: alignPaidSocialChannelText(ad.primaryText, platform) || ad.primaryText,
        headline: alignPaidSocialChannelText(ad.headline, platform) || ad.headline,
        description: alignPaidSocialChannelText(ad.description, platform) || ad.description,
        visualGuide: alignPaidSocialChannelText(ad.visualGuide, platform),
      };
    }),
  });
}

function alignOrganicChannelText(value: string | undefined, platform: string) {
  if (!value) return value;
  const label = platform === 'x' ? 'X' : platform.charAt(0).toUpperCase() + platform.slice(1);
  return value
    .replace(/\b(?:facebook|instagram|insta|linkedin|twitter|x)\s+organic\s+posts?\b/gi, `${label} organic post`)
    .replace(/\b(?:responsive\s+)?(?:google\s+)?search[- ]style\s+ads?\b/gi, `${label} organic post`)
    .replace(/\b(?:responsive\s+)?(?:google\s+)?search\s+ads?\b/gi, `${label} post`)
    .replace(/\bgoogle(?:\s+search)?\s+ads?\b/gi, `${label} post`)
    .replace(/\b(?:facebook|instagram|insta|linkedin|twitter|x)\s+(?:paid\s+)?ads?\b/gi, `${label} post`)
    .replace(/\bpaid\s+social\s+ads?\b/gi, `${label} post`)
    .replace(/\b(?:facebook|instagram|insta|linkedin|twitter|x)\s+posts?\b/gi, `${label} post`)
    .replace(/\bsearch[- ]focused\b/gi, `${label}-focused`)
    .replace(/\b(?:facebook|instagram|insta|linkedin|twitter)\b/gi, label)
    .replace(/\bX\b(?=\s+(?:post|thread|organic|feed|content|first|friendly)\b)/g, label);
}

function alignPaidSocialChannelText(value: string | undefined, platform: string) {
  if (!value) return value;
  const label = platform === 'x' ? 'X' : platform.charAt(0).toUpperCase() + platform.slice(1);
  return value
    .replace(
      /\bn\/?a\s+for\s+(?:a\s+)?(?:google\s+)?search\s+ads?\s*;?\s*(?:if\s+used\s+in\s+asset\s+extensions,?\s*)?/gi,
      `For the ${label} feed, `,
    )
    .replace(/\b(?:responsive\s+)?(?:google\s+)?search[- ]style\s+ads?\b/gi, `${label} paid social ad`)
    .replace(/\b(?:responsive\s+)?(?:google\s+)?search\s+ads?\b/gi, `${label} paid social ad`)
    .replace(/\basset\s+extensions?\b/gi, `${label} feed placement`)
    .replace(/\b(?:facebook|instagram|insta|linkedin|twitter)\b/gi, label)
    .replace(/\bX\b(?=\s+(?:post|thread|organic|feed|content|first|friendly|ad)\b)/g, label)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function alignOrganicTopic(value: string, platform: string) {
  if (!/\b(?:facebook|instagram|insta|linkedin|twitter|google|search|paid|organic|social\s+ad)\b/i.test(value)) return value;
  const label = platform === 'x' ? 'X' : platform.charAt(0).toUpperCase() + platform.slice(1);
  return `${label} organic post`;
}

export function campaignPlatformConsistencyFindings(pack: CampaignPack, prompt: string): QaFinding[] {
  const requested = extractRequestedChannelConstraints(prompt);
  const findings: QaFinding[] = [];

  pack.socialPosts.forEach((post, index) => {
    if (requested.organicSocial.length) {
      const invalidPlatform = post.platforms.find((platform) => !requested.organicSocial.includes(platform));
      if (invalidPlatform) {
        findings.push({
          group: 'socialPosts',
          index,
          severity: 'blocking',
          problem: `Organic post uses unrequested platform ${invalidPlatform}.`,
          suggestion: `Use only the requested organic platforms: ${requested.organicSocial.join(', ')}.`,
        });
      }
    }
    const expectedPlatforms = post.platforms.length ? post.platforms : requested.organicSocial;
    const metadata = `${post.name} ${post.topic} ${post.creativeBrief || ''} ${post.visualGuide || ''}`;
    const conflictingChannel = organicMetadataConflict(metadata, expectedPlatforms);
    if (conflictingChannel) {
      findings.push({
        group: 'socialPosts',
        index,
        severity: 'blocking',
        problem: `Organic post metadata still describes ${conflictingChannel} instead of ${expectedPlatforms.join(', ') || 'its selected organic platform'}.`,
        suggestion: 'Make topic, creative brief, visual guide, and platform fields describe the same organic asset.',
      });
    }
  });

  pack.socialAds.forEach((ad, index) => {
    if (requested.paidSocial.length && !requested.paidSocial.includes(ad.platform)) {
      findings.push({
        group: 'socialAds',
        index,
        severity: 'blocking',
        problem: `Paid social ad uses unrequested platform ${ad.platform}.`,
        suggestion: `Use only the requested paid platforms: ${requested.paidSocial.join(', ')}.`,
      });
    }
    const metadata = `${ad.name} ${ad.topic} ${ad.visualGuide || ''}`;
    const conflictingChannel = paidSocialMetadataConflict(metadata, ad.platform);
    if (!conflictingChannel) return;
    findings.push({
      group: 'socialAds',
      index,
      severity: 'blocking',
      problem: `Paid social ad metadata still describes ${conflictingChannel} instead of ${ad.platform}.`,
      suggestion: 'Make the ad name, topic, visual guide, and platform fields describe the same paid social asset.',
    });
  });

  return findings;
}

function organicMetadataConflict(value: string, expectedPlatforms: string[]) {
  if (/\b(?:google(?:\s+search)?|responsive\s+search|search(?:[- ]style)?)\s+ads?\b|\basset\s+extensions?\b/i.test(value)) return 'a Google/Search ad';
  if (/\b(?:paid\s+social|social\s+ad)\b/i.test(value)) return 'a paid social ad';
  const platformPatterns: Array<[string, RegExp]> = [
    ['Instagram', /\b(?:instagram|insta)\b/i],
    ['Facebook', /\bfacebook\b/i],
    ['LinkedIn', /\blinkedin\b/i],
    ['X/Twitter', /\btwitter\b|\bx(?:\/twitter)?\s+(?:post|thread|organic)\b/i],
  ];
  for (const [label, pattern] of platformPatterns) {
    const normalized = label === 'X/Twitter' ? 'x' : label.toLowerCase();
    if (pattern.test(value) && !expectedPlatforms.includes(normalized)) return `${label} content`;
  }
  return '';
}

function paidSocialMetadataConflict(value: string, expectedPlatform: string) {
  if (/\b(?:google(?:\s+search)?|responsive\s+search|search(?:[- ]style)?)\s+ads?\b|\basset\s+extensions?\b/i.test(value)) {
    return 'a Google/Search ad';
  }
  const platformPatterns: Array<[string, RegExp]> = [
    ['Instagram', /\b(?:instagram|insta)\b/i],
    ['Facebook', /\bfacebook\b/i],
    ['LinkedIn', /\blinkedin\b/i],
    ['X/Twitter', /\btwitter\b|\bx(?:\/twitter)?\s+(?:post|thread|organic|ad)\b/i],
  ];
  for (const [label, pattern] of platformPatterns) {
    const normalized = label === 'X/Twitter' ? 'x' : label.toLowerCase();
    if (pattern.test(value) && normalized !== expectedPlatform) return `${label} content`;
  }
  return '';
}

export function campaignSectionValidationError(
  input: unknown,
  key: GeneratedCampaignSectionKey,
  expectedCount: number,
): string | null {
  if (expectedCount <= 0) return null;

  const record = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : null;
  const sectionInput = record && key in record ? record[key] : input;
  const pack = normalizeCampaignPack({ [key]: sectionInput });
  const actualCount = pack[key].length;

  if (actualCount >= expectedCount) return null;
  return `Expected at least ${expectedCount} ${campaignSectionLabel(key)} but generated ${actualCount}.`;
}

function campaignSectionLabel(key: GeneratedCampaignSectionKey) {
  if (key === 'socialPosts') return 'social posts';
  if (key === 'googleAds') return 'Google ads';
  if (key === 'socialAds') return 'paid social ads';
  return 'blog outlines';
}

export function applyContentPatches(pack: CampaignPack, patches: ContentPatch[]): CampaignPack {
  const draft = structuredClone(pack) as CampaignPack;
  for (const patch of patches) {
    const group = draft[patch.group] as Array<Record<string, unknown>>;
    const item = group?.[patch.index];
    if (!item || !editableFields[patch.group].has(patch.field)) continue;
    item[patch.field] = patch.value;
  }
  return normalizeCampaignPack(draft);
}

export function reviewFindingResolvedByPatches(finding: QaFinding, patches: ContentPatch[]) {
  const relevant = patches.filter((patch) => patch.group === finding.group && patch.index === finding.index);
  if (!relevant.length) return false;
  const problem = finding.problem.toLowerCase();
  const actionFields = finding.group === 'socialPosts'
    ? ['caption']
    : finding.group === 'googleAds'
      ? ['headlines', 'descriptions', 'callouts']
      : finding.group === 'socialAds'
        ? ['cta', 'primaryText', 'headline', 'description']
        : ['title', 'excerpt', 'metaTitle', 'metaDescription', 'outline'];
  const expectedFields = Array.from(new Set([
    ...(problem.includes('visual') ? ['visualGuide'] : []),
    ...(problem.includes('caption') || problem.includes('opening') ? ['caption'] : []),
    ...(problem.includes('primary text') || problem.includes('primary copy') ? ['primaryText'] : []),
    ...(problem.includes('keyword') ? ['keywords', 'headlines', 'descriptions'] : []),
    ...(problem.includes('cta') || problem.includes('action') || problem.includes('next step') ? actionFields : []),
    ...(problem.includes('headline') ? ['headline', 'headlines'] : []),
    ...(problem.includes('description') ? ['description', 'descriptions'] : []),
    ...(problem.includes('platform') ? ['platform', 'topic', 'creativeBrief', 'visualGuide'] : []),
  ]));
  return expectedFields.length
    ? relevant.some((patch) => expectedFields.includes(patch.field))
    : true;
}

export function repairCampaignPack(
  pack: CampaignPack,
  brief: Pick<InternalBrief, 'desiredAction'> & Partial<Pick<InternalBrief, 'keywordTargets' | 'confirmedFacts'>>,
): { pack: CampaignPack; notes: string[] } {
  const draft = structuredClone(pack) as CampaignPack;
  const notes: string[] = [];
  const repair = (value: string | undefined, location: string) => {
    if (!value) return value;
    const repaired = repairUnsupportedAttribution(repairActionLanguage(repairAwkwardActionPhrase(value), brief.desiredAction));
    if (repaired !== value) notes.push(`${location}: aligned the wording with the requested action.`);
    return repaired;
  };

  draft.socialPosts = draft.socialPosts.map((item, index) => ({
    ...item,
    caption: repair(item.caption, `Social post ${index + 1}`) || item.caption,
    creativeBrief: repair(item.creativeBrief, `Social post ${index + 1} creative brief`),
  }));
  const explicitKeywords = cleanKeywords(brief.keywordTargets || []);
  const alreadyAssigned = cleanKeywords(draft.googleAds.flatMap((item) => item.keywords || []));
  const missingAssignments = explicitKeywords.filter((target) => !alreadyAssigned.some((keyword) => sameKeyword(keyword, target)));
  draft.googleAds = draft.googleAds.map((item, index) => {
    const recoveredTargets = missingAssignments.filter((_, keywordIndex) => keywordIndex % Math.max(1, draft.googleAds.length) === index);
    const keywords = assignedKeywords(item.keywords, item.topic, recoveredTargets);
    const alignedHeadlines = item.headlines.map((value) => repair(value, `Google ad ${index + 1} headline`) || value);
    const completeHeadlines = alignedHeadlines.filter((value) => (
      !looksLikeIncompleteGoogleHeadline(value) && !hasGenericFiller(value)
    ));
    const finalHeadlines = buildGoogleHeadlines(completeHeadlines, keywords, brief.desiredAction);
    if (finalHeadlines.length !== alignedHeadlines.length || completeHeadlines.length !== alignedHeadlines.length) {
      notes.push(`Google ad ${index + 1}: removed weak headline fragments and rebuilt a complete keyword-aware set.`);
    }
    const repairedDescriptions = item.descriptions.filter((value) => !hasGenericFiller(value)).map((value) => {
      const aligned = repair(value, `Google ad ${index + 1} description`) || value;
      const finished = finishGoogleDescription(aligned);
      if (finished !== aligned) notes.push(`Google ad ${index + 1} description: completed an unfinished line.`);
      return finished;
    });
    const finalDescriptions = buildGoogleDescriptions(repairedDescriptions, keywords);
    if (finalDescriptions.length !== repairedDescriptions.length) {
      notes.push(`Google ad ${index + 1}: kept complete descriptions with natural keyword coverage.`);
    }
    return {
      ...item,
      keywords,
      headlines: finalHeadlines,
      descriptions: finalDescriptions,
      callouts: item.callouts?.map((value) => repair(value, `Google ad ${index + 1} callout`) || value),
    };
  });
  draft.socialAds = draft.socialAds.map((item, index) => ({
    ...item,
    primaryText: repair(item.primaryText, `Paid social ad ${index + 1}`) || item.primaryText,
    headline: repair(item.headline, `Paid social ad ${index + 1} headline`) || item.headline,
    description: repair(item.description, `Paid social ad ${index + 1} description`),
  }));
  draft.blogOutlines = draft.blogOutlines.map((item, index) => ({
    ...item,
    title: repair(item.title, `Blog ${index + 1} title`) || item.title,
    excerpt: repair(item.excerpt, `Blog ${index + 1} excerpt`) || item.excerpt,
    metaTitle: repair(item.metaTitle, `Blog ${index + 1} meta title`) || item.metaTitle,
    metaDescription: repair(item.metaDescription, `Blog ${index + 1} meta description`) || item.metaDescription,
    outline: item.outline.map((value, lineIndex) => {
      const withoutMisplacedAction = lineIndex > 0 && lineIndex < item.outline.length - 1
        ? removeConversionActionFromHeading(value)
        : repairActionLanguage(value, brief.desiredAction);
      const repaired = repairAwkwardActionPhrase(withoutMisplacedAction);
      if (repaired !== value) notes.push(`Blog ${index + 1} outline: removed an awkward action phrase.`);
      return repaired;
    }),
  }));

  return { pack: normalizeCampaignPack(draft), notes: Array.from(new Set(notes)) };
}

export function deterministicQualityFindings(
  pack: CampaignPack,
  brand: BrandInstructions,
  brief?: Pick<InternalBrief, 'desiredAction'> & Partial<Pick<InternalBrief, 'keywordTargets' | 'confirmedFacts'>>,
): QaFinding[] {
  const findings: QaFinding[] = [];
  const copyItems = [
    ...pack.socialPosts.map((item, index) => ({ group: 'socialPosts' as const, index, value: item.caption })),
    ...pack.googleAds.map((item, index) => ({ group: 'googleAds' as const, index, value: [...item.headlines, ...item.descriptions, ...(item.callouts || [])].join(' ') })),
    ...pack.socialAds.map((item, index) => ({ group: 'socialAds' as const, index, value: `${item.headline} ${item.primaryText}` })),
    ...pack.blogOutlines.map((item, index) => ({ group: 'blogOutlines' as const, index, value: `${item.title} ${item.excerpt}` })),
  ];

  for (let left = 0; left < copyItems.length; left += 1) {
    for (let right = left + 1; right < copyItems.length; right += 1) {
      const score = jaccard(copyItems[left].value, copyItems[right].value);
      const overlapThreshold = copyItems[left].group === copyItems[right].group ? 0.68 : 0.75;
      if (score < overlapThreshold) continue;
      findings.push({
        group: copyItems[right].group,
        index: copyItems[right].index,
        severity: 'warning',
        problem: `Copy substantially repeats another item (${Math.round(score * 100)}% word overlap).`,
        suggestion: 'Use a different content angle, opening, proof point, and sentence structure.',
      });
    }
  }

  const prohibited = brand.prohibitedTerms.map((term) => term.trim()).filter((term) => term.length >= 3);
  for (const item of copyItems) {
    const matched = prohibited.filter((term) => containsWholeTerm(item.value, term));
    if (!matched.length) continue;
    findings.push({
      group: item.group,
      index: item.index,
      severity: 'blocking',
      problem: `Uses prohibited brand wording: ${matched.join(', ')}.`,
      suggestion: 'Replace the prohibited wording with an approved, natural alternative.',
    });
  }

  const desiredAction = brief?.desiredAction || '';
  for (const item of copyItems) {
    if (!hasConflictingAction(item.value, desiredAction)) continue;
    findings.push({
      group: item.group,
      index: item.index,
      severity: 'blocking',
      problem: `Uses a different conversion action from the brief’s requested “${desiredAction}”.`,
      suggestion: 'Use the same requested next step consistently across every asset.',
    });
  }

  for (const item of copyItems) {
    if (!unsupportedAttributionPattern.test(item.value)) continue;
    findings.push({
      group: item.group,
      index: item.index,
      severity: 'blocking',
      problem: 'Uses an unsupported customer or audience attribution as if it were a verified testimonial or research finding.',
      suggestion: 'State the audience problem directly without claiming that customers or users reported it.',
    });
  }

  pack.googleAds.forEach((ad, index) => {
    if (ad.headlines.length < 8) {
      findings.push({
        group: 'googleAds',
        index,
        severity: 'blocking',
        problem: 'Contains fewer than 8 distinct Google Search headlines.',
        suggestion: 'Add varied keyword, benefit, differentiator, reassurance, and CTA headlines.',
      });
    }
    if (ad.descriptions.length < 2) {
      findings.push({
        group: 'googleAds',
        index,
        severity: 'blocking',
        problem: 'Contains fewer than 2 distinct Google Search descriptions.',
        suggestion: 'Add a second description with useful information that is not repeated in the headlines.',
      });
    }
    const keywords = cleanKeywords(ad.keywords);
    const actionKeywords = keywords.filter(isGenericActionKeyword);
    if (actionKeywords.length) {
      findings.push({
        group: 'googleAds',
        index,
        severity: 'blocking',
        problem: `Uses conversion CTA text as a Google Search keyword: ${actionKeywords.join(', ')}.`,
        suggestion: 'Keep keywords to real search terms; use the conversion action in headlines or descriptions instead.',
      });
    }
    const keywordWords = keywords.flatMap(searchThemeWords);
    const keywordHeadlineCount = ad.headlines.filter((headline) => {
      return keywords.some((keyword) => keywordMatchesText(keyword, headline));
    }).length;
    if (!keywords.length || !keywordWords.length) {
      findings.push({
        group: 'googleAds',
        index,
        severity: 'blocking',
        problem: 'The Google ad has no usable keyword list.',
        suggestion: 'Assign one or more closely related search terms from the client list or confirmed brief.',
      });
    } else if (keywordHeadlineCount < 2) {
      findings.push({
        group: 'googleAds',
        index,
        severity: 'blocking',
        problem: 'The assigned keyword group appears naturally in fewer than 2 headlines.',
        suggestion: 'Include assigned keywords or close natural variants in at least two complete headlines.',
      });
    }
    const nonKeywordHeadlines = ad.headlines.filter((headline) => !keywords.some((keyword) => keywordMatchesText(keyword, headline)));
    if (keywords.length && nonKeywordHeadlines.length < 3) {
      findings.push({
        group: 'googleAds',
        index,
        severity: 'blocking',
        problem: 'Contains fewer than 3 non-keyword headlines for benefits, reassurance, or action.',
        suggestion: 'Balance keyword relevance with at least three genuinely different non-keyword messages.',
      });
    }
    if (keywords.length && !ad.descriptions.some((description) => keywords.some((keyword) => keywordMatchesText(keyword, description)))) {
      findings.push({
        group: 'googleAds',
        index,
        severity: 'blocking',
        problem: 'No description uses the assigned keyword group naturally.',
        suggestion: 'Use an assigned keyword or close natural variant in at least one description.',
      });
    }
    const requiredForAd = keywords.filter((keyword) => (brief?.keywordTargets || []).some((target) => sameKeyword(target, keyword)));
    const adCopy = [...ad.headlines, ...ad.descriptions].join(' ');
    const missingAssigned = requiredForAd.filter((keyword) => !containsExactKeyword(adCopy, keyword));
    if (missingAssigned.length) {
      findings.push({
        group: 'googleAds',
        index,
        severity: 'blocking',
        problem: `Does not use assigned client keyword${missingAssigned.length === 1 ? '' : 's'} in the ad copy: ${missingAssigned.join(', ')}.`,
        suggestion: 'Preserve each client keyword in at least one headline or description without stuffing.',
      });
    }
    if ([...ad.headlines, ...ad.descriptions, ...(ad.callouts || [])].some(hasGenericFiller)) {
      findings.push({
        group: 'googleAds',
        index,
        severity: 'blocking',
        problem: 'Contains generic filler or internal workflow language instead of publishable ad copy.',
        suggestion: 'Replace it with specific, reader-facing information grounded in the brief.',
      });
    }
    if (ad.headlines.some(looksLikeIncompleteGoogleHeadline)) {
      findings.push({
        group: 'googleAds',
        index,
        severity: 'blocking',
        problem: 'Contains a Google ad headline that ends as an unfinished phrase.',
        suggestion: 'Remove or rewrite the fragment as a complete headline within the 30-character limit.',
      });
    }
    if (!ad.descriptions.some(looksLikeIncompleteGoogleDescription)) return;
    findings.push({
      group: 'googleAds',
      index,
      severity: 'blocking',
      problem: 'Contains a Google ad description that ends as an unfinished phrase.',
      suggestion: 'Rewrite it as a complete, natural description within the 90-character limit.',
    });
  });

  const missingClientKeywords = cleanKeywords(brief?.keywordTargets || []).filter((target) => (
    !pack.googleAds.some((ad) => ad.keywords.some((keyword) => sameKeyword(keyword, target)))
  ));
  if (missingClientKeywords.length && pack.googleAds.length) {
    findings.push({
      group: 'googleAds',
      index: 0,
      severity: 'blocking',
      problem: `Client keyword${missingClientKeywords.length === 1 ? '' : 's'} were dropped from the ad groups: ${missingClientKeywords.join(', ')}.`,
      suggestion: 'Distribute every client-supplied keyword across closely related ad groups without changing the terms.',
    });
  }

  pack.blogOutlines.forEach((blog, index) => {
    const misplacedAction = blog.outline.some((line, lineIndex) => (
      /\b(?:book|schedule|request)\s+(?:a\s+)?(?:discovery call|demo)\b/i.test(line)
      && lineIndex > 0
      && lineIndex < blog.outline.length - 1
    ));
    if (misplacedAction) {
      findings.push({
        group: 'blogOutlines',
        index,
        severity: 'blocking',
        problem: 'Places a conversion CTA inside a body-section heading.',
        suggestion: 'Keep body headings useful and place the campaign action naturally in the conclusion.',
      });
    }
    const timedClaim = [blog.title, blog.excerpt, blog.metaTitle, blog.metaDescription, ...blog.outline]
      .find((value) => /\b(?:in|under|within)\s+(?:less than\s+)?(?:\d+|one|a)\s+(?:seconds?|minutes?|hours?|days?)\b/i.test(value));
    const timedPhrase = timedClaim?.match(/\b(?:in|under|within)\s+(?:less than\s+)?(?:\d+|one|a)\s+(?:seconds?|minutes?|hours?|days?)\b/i)?.[0] || '';
    if (timedPhrase && !(brief?.confirmedFacts || []).some((fact) => fact.toLowerCase().includes(timedPhrase.toLowerCase()))) {
      findings.push({
        group: 'blogOutlines',
        index,
        severity: 'blocking',
        problem: 'Uses an unconfirmed quantified time claim.',
        suggestion: 'Remove the time claim unless it appears in the confirmed client facts.',
      });
    }
  });

  return findings.slice(0, 30);
}

function containsWholeTerm(value: string, term: string) {
  const phrase = term
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  if (!phrase) return false;
  return new RegExp(`(?:^|[^a-z0-9])${phrase}(?=$|[^a-z0-9])`, 'i').test(value);
}

function repairActionLanguage(value: string, desiredAction: string) {
  if (/\bdiscovery call\b/i.test(desiredAction)) {
    const preferredAction = normalizePreferredAction(desiredAction);
    return value.replace(/\b(?:book|schedule|request)\s+(?:a\s+)?(?:free\s+)?demo(?:\s+today)?\b/gi, (match) => (
      /^[A-Z]/.test(match) ? 'Book a Discovery Call' : 'book a discovery call'
    )).replace(/\b(?:contact\s+(?:us|[a-z0-9&'. -]{2,60})|get in touch|learn more|reach out)\.?$/i, preferredAction);
  }
  if (/\bdemo\b/i.test(desiredAction) && !/\bdiscovery call\b/i.test(desiredAction)) {
    return value.replace(/\b(?:book|schedule|request)\s+(?:a\s+)?discovery call(?:\s+today)?\b/gi, (match) => (
      /^[A-Z]/.test(match) ? 'Book a Demo' : 'book a demo'
    ));
  }
  return value;
}

function repairAwkwardActionPhrase(value: string) {
  return value.replace(/,\s*and\s+worth\s+(?:booking|scheduling|requesting)[^.?!]+?\s+around(?=[.?!]|$)/gi, ', and simple to continue');
}

const unsupportedAttributionPattern = /\b(?:customers?|clients?|users?|patients?|practice managers?|clinic owners?|teams?)\s+(?:often\s+)?(?:tell us|say|report|agree|love)\b/i;

function repairUnsupportedAttribution(value: string) {
  const repaired = value.replace(
    /\b(?:customers?|clients?|users?|patients?|practice managers?(?:\s+and\s+clinic owners?)?|clinic owners?|teams?)\s+(?:often\s+)?(?:tell us|say|report|agree)(?:\s+the same thing)?\s*:\s*/gi,
    '',
  ).trim();
  if (!repaired || repaired === value) return value;
  return `${repaired.charAt(0).toUpperCase()}${repaired.slice(1)}`;
}

function removeConversionActionFromHeading(value: string) {
  const repaired = value
    .replace(/\s*(?:[-:]\s*)?\b(?:book|schedule|request)\s+(?:a\s+)?(?:discovery call|demo)\b.*$/i, '')
    .trim();
  return repaired || 'Practical next steps';
}

function finishGoogleDescription(value: string) {
  let repaired = value.replace(/\s+/g, ' ').trim();
  repaired = repaired.replace(/\s+(?:for|with|to|of|in|on|at|by|from|about|into|through)\s+(?:dental|mobile|online|better|clear|easy|faster|warmer|your|our|their|every|independent|local|new)$/i, '');
  repaired = repaired.replace(/\s+(?:and|or|for|with|to|of|in|on|at|by|from|about|into|through|the|a|an|your|our|their)$/i, '');
  if (!/[.!?]$/.test(repaired) && repaired.length < 90) repaired = `${repaired}.`;
  return repaired;
}

function hasConflictingAction(value: string, desiredAction: string) {
  if (/\bdiscovery call\b/i.test(desiredAction)) {
    return /\b(?:book|schedule|request)\s+(?:a\s+)?(?:free\s+)?demo\b/i.test(value)
      || /\b(?:contact\s+(?:us|[a-z0-9&'. -]{2,60})|get in touch|learn more|reach out)\.?$/i.test(value);
  }
  if (/\bdemo\b/i.test(desiredAction) && !/\bdiscovery call\b/i.test(desiredAction)) {
    return /\b(?:book|schedule|request)\s+(?:a\s+)?discovery call\b/i.test(value);
  }
  return false;
}

function normalizePreferredAction(value: string) {
  const action = value.trim().replace(/[.!?]+$/, '');
  if (!action) return '';
  return `${action.charAt(0).toUpperCase()}${action.slice(1)}.`;
}

function buildGoogleHeadlines(existing: string[], keywords: string[], desiredAction: string) {
  const keywordHeadlines = existing.filter((headline) => keywords.some((keyword) => keywordMatchesText(keyword, headline)));
  for (const keyword of keywords) {
    if (keywordHeadlines.length >= Math.max(2, Math.min(keywords.length, 12))) break;
    if (keywordHeadlines.some((headline) => containsExactKeyword(headline, keyword))) continue;
    keywordHeadlines.push(compactHeadline(keyword));
  }
  for (let variant = 0; keywordHeadlines.length < 2 && keywords.length; variant += 1) {
    keywordHeadlines.push(keywordHeadlineVariant(keywords[variant % keywords.length], variant));
  }

  const nonKeywordHeadlines = existing.filter((headline) => !keywords.some((keyword) => keywordMatchesText(keyword, headline)));
  for (const fallback of fallbackGoogleHeadlines(desiredAction)) {
    if (nonKeywordHeadlines.length >= 3) break;
    nonKeywordHeadlines.push(fallback);
  }

  const headlines = uniqueCaseInsensitive([
    ...keywordHeadlines,
    ...nonKeywordHeadlines.slice(0, 3),
    ...existing,
  ]).filter((headline) => headline.length <= 30 && !looksLikeIncompleteGoogleHeadline(headline));
  for (const fallback of fallbackGoogleHeadlines(desiredAction)) {
    if (headlines.length >= 8) break;
    if (!headlines.some((headline) => headline.toLowerCase() === fallback.toLowerCase())) headlines.push(fallback);
  }
  return headlines.slice(0, 15);
}

function buildGoogleDescriptions(existing: string[], keywords: string[]) {
  const descriptions = existing.filter((description) => !looksLikeIncompleteGoogleDescription(description) && !hasGenericFiller(description));
  if (keywords.length && !descriptions.some((description) => keywords.some((keyword) => keywordMatchesText(keyword, description)))) {
    descriptions.unshift(keywordDescription(keywords[0]));
  }
  for (const keyword of keywords) {
    if (descriptions.some((description) => containsExactKeyword(description, keyword))) continue;
    const candidate = keywordDescription(keyword);
    if (containsExactKeyword(candidate, keyword)) descriptions.push(candidate);
  }
  for (const fallback of fallbackGoogleDescriptions(keywords[0])) {
    if (descriptions.length >= 2) break;
    descriptions.push(fallback);
  }
  return uniqueCaseInsensitive(descriptions).filter((description) => description.length <= 90).slice(0, 4);
}

function fallbackGoogleHeadlines(desiredAction: string) {
  const action = /\bdiscovery call\b/i.test(desiredAction)
    ? 'Book a Discovery Call'
    : /\bdemo\b/i.test(desiredAction)
      ? 'Book a Demo'
      : 'Take the Next Step';
  return [
    action,
    'Make the Next Step Clear',
    'Clearer Online Experience',
    'Simple Paths to Book',
    'Explore Helpful Details',
    'See Your Options Clearly',
    'Get Useful Information',
    'Learn More With Confidence',
  ];
}

function fallbackGoogleDescriptions(keyword = 'your options') {
  const subject = compactPhrase(keyword, 44) || 'your options';
  return [
    finishGoogleDescription(`Explore ${subject} with clear information and a simple way to continue`),
    finishGoogleDescription(`See practical details about ${subject} and decide what fits your needs`),
  ];
}

function assignedKeywords(current: string[], topic: string, recoveredTargets: string[]) {
  const combined = cleanKeywords([...(current || []), ...recoveredTargets]).filter((keyword) => !isGenericActionKeyword(keyword));
  if (combined.length) return combined;
  return cleanKeywords([topic]).filter((keyword) => !isGenericActionKeyword(keyword));
}

function isGenericActionKeyword(value: string) {
  return /^(?:(?:book|request|schedule)(?:\s+(?:a|your))?\s+demo(?:\s+today)?|contact\s+us|learn\s+more|get\s+started|sign\s+up|shop\s+now|download(?:\s+the)?\s+app)$/i
    .test(value.trim());
}

function cleanKeywords(values: string[]) {
  return uniqueCaseInsensitive(values.map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean)).slice(0, 50);
}

function sameKeyword(left: string, right: string) {
  return normalizeSearchPhrase(left) === normalizeSearchPhrase(right);
}

function containsExactKeyword(value: string, keyword: string) {
  const haystack = ` ${normalizeSearchPhrase(value)} `;
  const needle = normalizeSearchPhrase(keyword);
  return !!needle && haystack.includes(` ${needle} `);
}

function keywordMatchesText(keyword: string, value: string) {
  if (containsExactKeyword(value, keyword)) return true;
  const keywordWords = searchThemeWords(keyword);
  const valueWords = wordSet(value);
  if (!keywordWords.length) return false;
  const matched = keywordWords.filter((word) => valueWords.has(word)).length;
  return matched >= Math.min(2, keywordWords.length) && matched / keywordWords.length >= 0.6;
}

function compactHeadline(value: string) {
  const titled = titleCaseWords(value);
  if (titled.length <= 30) return titled;
  return compactPhrase(titled, 30);
}

function keywordHeadlineVariant(keyword: string, variant: number) {
  const subject = compactPhrase(titleCaseWords(keyword), variant % 2 === 0 ? 22 : 20);
  const candidate = variant % 2 === 0 ? `Explore ${subject}` : `${subject} Options`;
  return compactPhrase(candidate, 30);
}

function keywordDescription(keyword: string) {
  const exact = keyword.replace(/\s+/g, ' ').trim();
  if (exact.length <= 58) return finishGoogleDescription(`Explore ${exact} with clear options and a simple way to continue`);
  return finishGoogleDescription(`Explore ${compactPhrase(exact, 50)} with clear information`);
}

function compactPhrase(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const clipped = normalized.slice(0, maxLength + 1);
  const boundary = clipped.lastIndexOf(' ');
  return (boundary >= Math.floor(maxLength * 0.55) ? clipped.slice(0, boundary) : clipped.slice(0, maxLength))
    .replace(/[\s,;:|/\\-]+$/g, '')
    .trim();
}

function uniqueCaseInsensitive(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.toLowerCase().trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function normalizeSearchPhrase(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleCaseWords(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function hasGenericFiller(value: string) {
  return /\b(?:active campaign brief|grounded in (?:the )?(?:active )?campaign brief|review clear information|learn more with useful details|brief-aligned copy|information from the active campaign brief)\b/i.test(value);
}

function searchThemeWords(value: string) {
  const ignored = new Set(['search', 'campaign', 'concept', 'theme', 'advertising', 'google', 'responsive']);
  return Array.from(wordSet(value)).filter((word) => word.length >= 4 && !ignored.has(word));
}

function looksLikeIncompleteGoogleHeadline(value: string) {
  const headline = value.replace(/[.!?]+$/, '').trim();
  return /\b(?:and|or|for|with|to|of|in|on|at|by|from|about|into|through|before|after|the|a|an|your|our|their|next|less|more|starts?|begins?)$/i.test(headline)
    || /\b(?:helps?|supports?)\s+(?:patients?|practices?|teams?|owners?|people|you|them)$/i.test(headline)
    || /\b(?:for|with|to|before|after)\s+(?:first|better|clearer|easier|faster|more|your|our|their)$/i.test(headline);
}

function looksLikeIncompleteGoogleDescription(value: string) {
  return /\s+(?:and|or|for|with|to|of|in|on|at|by|from|about|into|through|the|a|an|your|our|their)[.!?]?$/i.test(value)
    || /\s+(?:for|with|to|of|in|on|at|by|from|about|into|through)\s+(?:dental|mobile|online|better|clear|easy|faster|warmer|your|our|their|every|independent|local|new)[.!?]?$/i.test(value);
}

function jaccard(left: string, right: string) {
  const leftWords = wordSet(left);
  const rightWords = wordSet(right);
  if (!leftWords.size || !rightWords.size) return 0;
  let intersection = 0;
  for (const word of leftWords) if (rightWords.has(word)) intersection += 1;
  return intersection / (leftWords.size + rightWords.size - intersection);
}

function wordSet(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9']{3,}/g) || []);
}

function addDays(startDate: string, offset: number) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(startDate)
    ? new Date(`${startDate}T00:00:00.000Z`)
    : new Date();
  parsed.setUTCDate(parsed.getUTCDate() + offset);
  return parsed.toISOString().slice(0, 10);
}
