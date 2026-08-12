import {
  defaultDeliverableContract,
  requestedChannelLabels,
  resolveDeliverableContract,
  type DeliverableContract,
} from './deliverable_contract.ts';

export type InternalBrief = {
  objective: string;
  audience: string;
  offerOrSubject: string;
  desiredAction: string;
  confirmedFacts: string[];
  keywordTargets: string[];
  assumptions: string[];
  criticalQuestions: string[];
  requestedChannels: string[];
  tone: string[];
  restrictions: string[];
  researchNeeded: boolean;
};

export type PlannerOutput = {
  researchQuery: string;
  campaignGuidance: string;
  deliverableContract: DeliverableContract;
  internalBrief: InternalBrief;
};

export type BrandInstructions = {
  sourceTitle: string;
  hardRules: string[];
  toneRules: string[];
  approvedTerms: string[];
  prohibitedTerms: string[];
  approvedFacts: string[];
  conflicts: string[];
  examplePatterns: string[];
};

export type ResearchFinding = {
  claim: string;
  sourceNumbers: number[];
  confidence: 'high' | 'medium' | 'low';
  publicUse: 'safe' | 'caution';
  campaignUse: string;
};

export type ResearchBrief = {
  question: string;
  findings: ResearchFinding[];
};

export type CreativeDirection = {
  title: string;
  centralIdea: string;
  audienceProblem: string;
  promise: string;
  keyMessages: string[];
  callsToAction: string[];
  contentAngles: string[];
  platformGuidance: Record<string, string>;
  strategy: {
    title: string;
    summary: string;
    objectives: string[];
    contentPillars: string[];
  };
};

export type QaFinding = {
  group: 'strategy' | 'socialPosts' | 'googleAds' | 'socialAds' | 'blogOutlines' | 'calendar';
  index: number;
  severity: 'note' | 'warning' | 'blocking';
  category?: QaFindingCategory;
  problem: string;
  suggestion: string;
};

export type QaFindingCategory =
  | 'deliverable_contract'
  | 'required_field'
  | 'unsupported_claim'
  | 'brand_or_product'
  | 'safety'
  | 'platform_limit'
  | 'cta'
  | 'creative_example'
  | 'polish';

export type ContentPatch = {
  group: 'socialPosts' | 'googleAds' | 'socialAds' | 'blogOutlines';
  index: number;
  field: string;
  value: unknown;
  reason: string;
};

export type MissionContext = {
  internalBrief: InternalBrief;
  brandInstructions: BrandInstructions;
  research: ResearchBrief;
  creativeDirection: CreativeDirection;
  qaFindings: QaFinding[];
};

export function fallbackPlannerOutput(
  prompt: string,
  destination: { projectName: string; campaignName: string },
): PlannerOutput {
  const deliverableContract = resolveDeliverableContract(
    prompt,
    null,
    defaultDeliverableContract,
  );
  const project = destination.projectName || 'the selected project';
  const compactPrompt = compact(prompt, 900);
  const audience = sentenceMatch(prompt, /\btarget\s+(.+?)(?=[.!?](?:\s|$))/i);
  const desiredAction = normalizeDesiredAction(
    sentenceMatch(prompt, /\bcta\s*:\s*(.+?)(?=[.!?](?:\s|$))/i)
      || sentenceMatch(prompt, /\bgoal\s+is\s+to\s+(.+?)(?=[.!?](?:\s|$))/i)
      || sentenceMatch(prompt, /\b(?:ask|want)\s+(?:the\s+)?(?:audience|user|customer|reader)s?\s+to\s+(.+?)(?=[.!?](?:\s|$))/i),
  );
  const campaignThought = sentenceMatch(prompt, /\bcampaign\s+around\s+(?:this\s+)?thought:\s*(.+?)(?=[.!?](?:\s|$))/i);
  const roughLine = prompt.match(/\brough\s+line[^'"‘’“”]*['"‘“]([^'"’”]+)['"’”]/i)?.[1]?.trim() || '';
  const toneText = sentenceMatch(prompt, /\btone\s+should\s+be\s+(.+?)(?=[.!?](?:\s|$))/i);
  const restrictionText = sentenceMatch(prompt, /\bdo\s+not\s+(.+?)(?=[.!?](?:\s|$))/i);
  const researchFocus = sentenceMatch(prompt, /\bresearch\s+(.+?)(?=[.!?](?:\s|$))/i).replace(/^recent\s+/i, '');
  const explicitChannels = requestedChannelLabels(prompt);
  const requestedChannels = explicitChannels.length ? explicitChannels : [
    deliverableContract.socialPosts > 0 ? 'organic social' : '',
    deliverableContract.googleAds > 0 ? 'Google Search ads' : '',
    deliverableContract.socialAds > 0 ? 'paid social' : '',
    deliverableContract.blogOutlines > 0 ? 'blog' : '',
  ].filter(Boolean);
  const keywordTargets = extractKeywordTargets(prompt);
  const confirmedFacts = uniqueStrings([
    audience ? `Target audience: ${audience}` : '',
    desiredAction ? `Desired action: ${desiredAction}` : '',
    campaignThought ? `Campaign thought: ${campaignThought}` : '',
    roughLine ? `The rough line from the client is “${roughLine}”.` : '',
    toneText ? `Requested tone: ${toneText}` : '',
    restrictionText ? `Restriction: do not ${restrictionText}` : '',
    keywordTargets.length ? `User-supplied Google Search keywords: ${keywordTargets.join(', ')}` : '',
  ]);
  return {
    researchQuery: compact(researchFocus
      ? `What do recent credible sources show about ${researchFocus}?`
      : `What recent audience evidence and channel behavior can responsibly improve this campaign for ${project}?`, 220),
    campaignGuidance: compactPrompt,
    deliverableContract,
    internalBrief: {
      objective: desiredAction
        ? compact(`Create a connected campaign${campaignThought ? ` around the idea that ${campaignThought}` : ''} that encourages ${audience || 'the stated audience'} to ${actionAfterTo(desiredAction)}.`, 500)
        : compactPrompt || `Prepare a campaign for ${project}.`,
      audience: audience || 'Audience described in the client brief.',
      offerOrSubject: destination.campaignName || project,
      desiredAction: desiredAction || 'Use the action explicitly requested in the client brief.',
      confirmedFacts,
      keywordTargets,
      assumptions: ['Unspecified creative details may be decided conservatively without inventing factual claims.'],
      criticalQuestions: [],
      requestedChannels,
      tone: toneText ? [toneText] : [],
      restrictions: restrictionText ? [`Do not ${restrictionText}`] : [],
      researchNeeded: /\b(?:research|recent|evidence|survey|study|statistics?|expectations?)\b/i.test(prompt),
    },
  };
}

export function normalizePlannerOutput(
  input: unknown,
  prompt: string,
  fallback: PlannerOutput,
): PlannerOutput {
  const record = asRecord(input);
  const brief = asRecord(record.internalBrief);
  const researchQuery = stringValue(record.researchQuery);
  const campaignGuidance = stringValue(record.campaignGuidance);
  const researchNeeded = booleanValue(brief.researchNeeded, fallback.internalBrief.researchNeeded);
  const desiredAction = normalizeDesiredAction(
    stringValue(brief.desiredAction) || fallback.internalBrief.desiredAction,
  );

  return {
    researchQuery: researchNeeded ? compact(researchQuery || fallback.researchQuery, 220) : '',
    campaignGuidance: compact(campaignGuidance || fallback.campaignGuidance, 1200),
    deliverableContract: resolveDeliverableContract(
      prompt,
      record.deliverableContract,
      fallback.deliverableContract,
    ),
    internalBrief: {
      objective: compact(normalizeObjectiveAction(stringValue(brief.objective) || fallback.internalBrief.objective), 500),
      audience: compact(stringValue(brief.audience) || fallback.internalBrief.audience, 350),
      offerOrSubject: compact(stringValue(brief.offerOrSubject) || fallback.internalBrief.offerOrSubject, 300),
      desiredAction: compact(desiredAction, 300),
      confirmedFacts: uniqueStrings([...fallback.internalBrief.confirmedFacts, ...stringArray(brief.confirmedFacts)]).slice(0, 16),
      keywordTargets: uniqueStrings([
        ...fallback.internalBrief.keywordTargets,
        ...keywordArray(brief.keywordTargets ?? brief.keywords ?? brief.searchKeywords),
      ]).slice(0, 50),
      assumptions: uniqueStrings([...fallback.internalBrief.assumptions, ...stringArray(brief.assumptions)]).slice(0, 12),
      criticalQuestions: stringArray(brief.criticalQuestions).slice(0, 5),
      requestedChannels: uniqueStrings([
        ...fallback.internalBrief.requestedChannels,
        ...stringArray(brief.requestedChannels),
      ]).slice(0, 12),
      tone: uniqueStrings([...fallback.internalBrief.tone, ...stringArray(brief.tone)]).slice(0, 12),
      restrictions: uniqueStrings([...fallback.internalBrief.restrictions, ...stringArray(brief.restrictions)]).slice(0, 16),
      researchNeeded,
    },
  };
}

export function requirePlannerResearch(
  planner: PlannerOutput,
  prompt: string,
  destination: { projectName: string; campaignName: string },
): PlannerOutput {
  const fallback = fallbackPlannerOutput(prompt, destination);
  return {
    ...planner,
    researchQuery: compact(planner.researchQuery || fallback.researchQuery, 220),
    internalBrief: {
      ...planner.internalBrief,
      researchNeeded: true,
    },
  };
}

function normalizeDesiredAction(value: string) {
  let action = compact(value, 300).replace(/[.!?]+$/, '');
  action = action.replace(
    /^(?:make|encourage|persuade)\s+(?:the\s+)?(?:audience|readers?|users?|customers?|patients?|practice owners?|dental practice owners?)\s+(?:to\s+)?/i,
    '',
  );
  if (!action) return '';
  return `${action.charAt(0).toUpperCase()}${action.slice(1)}.`;
}

function actionAfterTo(value: string) {
  const action = value.replace(/[.!?]+$/, '');
  return action ? `${action.charAt(0).toLowerCase()}${action.slice(1)}` : action;
}

function normalizeObjectiveAction(value: string) {
  return value.replace(
    /\bto\s+(?:make|encourage|persuade)\s+(?:the\s+)?(?:audience|readers?|users?|customers?|patients?|practice owners?|dental practice owners?)\s+(?:to\s+)?/gi,
    'to ',
  );
}

export function emptyBrandInstructions(sourceTitle = ''): BrandInstructions {
  return {
    sourceTitle,
    hardRules: [],
    toneRules: [],
    approvedTerms: [],
    prohibitedTerms: [],
    approvedFacts: [],
    conflicts: [],
    examplePatterns: [],
  };
}

export function normalizeBrandInstructions(input: unknown, sourceTitle = ''): BrandInstructions {
  const record = asRecord(input);
  return {
    sourceTitle: compact(stringValue(record.sourceTitle) || sourceTitle, 240),
    hardRules: stringArray(record.hardRules).slice(0, 16),
    toneRules: stringArray(record.toneRules).slice(0, 16),
    approvedTerms: stringArray(record.approvedTerms).slice(0, 20),
    prohibitedTerms: stringArray(record.prohibitedTerms).slice(0, 20),
    approvedFacts: stringArray(record.approvedFacts).slice(0, 20),
    conflicts: stringArray(record.conflicts).slice(0, 10),
    examplePatterns: stringArray(record.examplePatterns).slice(0, 8),
  };
}

export function emptyResearchBrief(question = ''): ResearchBrief {
  return { question, findings: [] };
}

export function normalizeResearchBrief(input: unknown, question = ''): ResearchBrief {
  const record = asRecord(input);
  const findings = Array.isArray(record.findings)
    ? record.findings.map((item) => normalizeResearchFinding(item)).filter((item): item is ResearchFinding => !!item)
    : [];
  return {
    question: compact(stringValue(record.question) || question, 300),
    findings: findings.slice(0, 8),
  };
}

export function fallbackCreativeDirection(planner: PlannerOutput): CreativeDirection {
  const roughLineFact = planner.internalBrief.confirmedFacts.find((fact) => /rough line|client line|campaign line/i.test(fact)) || '';
  const roughLine = roughLineFact.match(/[“"]([^”"]+)[”"]/)?.[1]?.trim() || '';
  const desiredAction = planner.internalBrief.desiredAction || 'take the requested next step';
  const audience = planner.internalBrief.audience || 'the stated audience';
  const primaryAudience = audience.split(';')[0]?.trim() || audience;
  const offeringFact = planner.internalBrief.confirmedFacts.find((fact) => /^\s*business and offering\s*:/i.test(fact));
  const subject = conciseOffering(
    offeringFact?.replace(/^\s*business and offering\s*:\s*/i, '')
      || planner.internalBrief.offerOrSubject
      || 'the verified offering',
  );
  const brandName = planner.internalBrief.confirmedFacts
    .find((fact) => /^\s*brand name\s*:/i.test(fact))
    ?.replace(/^\s*brand name\s*:\s*/i, '')
    .replace(/[.!?]+$/, '')
    .trim();
  const title = roughLine || (brandName ? `${brandName} Campaign Direction` : compact(subject, 72)) || 'Campaign Direction';
  const proofPoint = planner.internalBrief.confirmedFacts.find((fact) => (
    !/^\s*(?:brand name|business and offering|primary audience|official website|primary (?:brand )?cta|verified brand colors)\s*:/i.test(fact)
  ));
  const proofPhrase = conciseFact(proofPoint || 'one confirmed brand fact');
  const channelGuidance = Object.fromEntries(planner.internalBrief.requestedChannels.map((channel) => {
    const normalized = channel.toLowerCase();
    if (normalized.includes('google') || normalized.includes('search')) {
      return [channel, 'Match clear search intent with concrete, responsible benefit language and one consistent next step.'];
    }
    if (normalized.includes('paid')) {
      return [channel, 'Use a strong visual hook and one focused reason to act; do not repeat the organic post opening.'];
    }
    if (normalized.includes('social')) {
      return [channel, 'Use a distinct audience insight or practical observation in every post, adapted to the named platform.'];
    }
    if (normalized.includes('blog')) {
      return [channel, 'Build a useful argument with evidence, practical takeaways, and a natural low-pressure next step.'];
    }
    return [channel, 'Use this channel for a distinct stage of the campaign instead of repeating another asset.'];
  }));
  const contentAngles = [
    compact(`Audience reality: show one recognizable problem, need, or goal for ${primaryAudience}.`, 280),
    compact(`Offering in practice: explain one verified way ${subject} is relevant to that audience need.`, 280),
    'Useful detail: turn a confirmed capability or workflow from the brief into a concrete, easy-to-understand benefit.',
    compact(`Proof without hype: build the message around ${proofPhrase} without inventing outcomes or guarantees.`, 280),
    compact(`Decision support: answer one practical question ${primaryAudience} may have before taking the next step.`, 280),
    `Low-pressure action: invite the audience to ${desiredAction.replace(/[.!?]+$/, '')} with a useful reason to continue.`,
  ];
  return {
    title,
    centralIdea: roughLine || planner.internalBrief.objective,
    audienceProblem: compact(`${primaryAudience} need a clear, trustworthy answer to the problems or goals connected to ${subject}.`, 400),
    promise: compact(`Show how ${subject} is relevant to ${primaryAudience}, then give them a clear reason to ${desiredAction.replace(/[.!?]+$/, '')}.`, 400),
    keyMessages: planner.internalBrief.confirmedFacts.slice(0, 5),
    callsToAction: planner.internalBrief.desiredAction ? [planner.internalBrief.desiredAction] : [],
    contentAngles,
    platformGuidance: channelGuidance,
    strategy: {
      title,
      summary: `${planner.internalBrief.objective} Keep every asset connected by one recognizable idea, while using a different audience insight, practical angle, or stage of the journey in each piece. The desired action is to ${desiredAction.replace(/[.!?]+$/, '')}.`,
      objectives: [planner.internalBrief.objective].filter(Boolean),
      contentPillars: [
        compact(`The real needs, friction points, and goals of ${primaryAudience}.`, 240),
        compact(`The verified offering and practical value of ${subject}.`, 240),
        'Confirmed brand facts and responsible proof without unsupported claims.',
        `A clear, natural path to ${desiredAction.replace(/[.!?]+$/, '')}.`,
      ],
    },
  };
}

export function normalizeCreativeDirection(input: unknown, fallback: CreativeDirection): CreativeDirection {
  const record = asRecord(input);
  const strategy = asRecord(record.strategy);
  const platformGuidance = asRecord(record.platformGuidance);
  const keyMessages = stringArray(record.keyMessages).slice(0, 8);
  const callsToAction = stringArray(record.callsToAction).slice(0, 6);
  const contentAngles = stringArray(record.contentAngles).slice(0, 16);
  const normalizedPlatformGuidance = Object.fromEntries(
    Object.entries(platformGuidance)
      .map(([key, value]) => [key, compact(stringValue(value), 300)])
      .filter(([, value]) => !!value),
  );
  const objectives = stringArray(strategy.objectives).slice(0, 8);
  const contentPillars = stringArray(strategy.contentPillars).slice(0, 8);
  return {
    title: compact(stringValue(record.title) || fallback.title, 180),
    centralIdea: compact(stringValue(record.centralIdea) || fallback.centralIdea, 500),
    audienceProblem: compact(stringValue(record.audienceProblem) || fallback.audienceProblem, 400),
    promise: compact(stringValue(record.promise) || fallback.promise, 400),
    keyMessages: keyMessages.length ? keyMessages : fallback.keyMessages,
    callsToAction: callsToAction.length ? callsToAction : fallback.callsToAction,
    contentAngles: contentAngles.length ? contentAngles : fallback.contentAngles,
    platformGuidance: Object.keys(normalizedPlatformGuidance).length ? normalizedPlatformGuidance : fallback.platformGuidance,
    strategy: {
      title: compact(stringValue(strategy.title) || stringValue(record.title) || fallback.strategy.title, 180),
      summary: compact(stringValue(strategy.summary) || fallback.strategy.summary, 1400),
      objectives: objectives.length ? objectives : fallback.strategy.objectives,
      contentPillars: contentPillars.length ? contentPillars : fallback.strategy.contentPillars,
    },
  };
}

export function normalizeQaFindings(input: unknown): QaFinding[] {
  const record = asRecord(input);
  const raw = Array.isArray(record.findings) ? record.findings : [];
  return raw.map((item) => {
    const value = asRecord(item);
    const group = stringValue(value.group) as QaFinding['group'];
    if (!['strategy', 'socialPosts', 'googleAds', 'socialAds', 'blogOutlines', 'calendar'].includes(group)) return null;
    const requestedSeverity = stringValue(value.severity) as QaFinding['severity'];
    const problem = compact(stringValue(value.problem), 400);
    const category = normalizeQaFindingCategory(value.category, problem);
    return {
      group,
      index: numberValue(value.index),
      severity: normalizeQaFindingSeverity(requestedSeverity, category),
      category,
      problem,
      suggestion: compact(stringValue(value.suggestion), 500),
    } satisfies QaFinding;
  }).filter((item): item is NonNullable<typeof item> => !!item && !!item.problem).slice(0, 30);
}

const qaFindingCategories: QaFindingCategory[] = [
  'deliverable_contract',
  'required_field',
  'unsupported_claim',
  'brand_or_product',
  'safety',
  'platform_limit',
  'cta',
  'creative_example',
  'polish',
];

const blockingQaCategories = new Set<QaFindingCategory>([
  'deliverable_contract',
  'required_field',
  'unsupported_claim',
  'brand_or_product',
  'safety',
  'platform_limit',
  'cta',
]);

function normalizeQaFindingCategory(input: unknown, problem: string): QaFindingCategory {
  const requested = stringValue(input) as QaFindingCategory;
  const normalized = problem.toLowerCase();
  const looksIllustrative = /imagined|illustrative|creative example|visual example|daily[- ]life|scene|scenario|situation|mood|metaphor|planning (?:a )?trip|for example/.test(normalized);
  const assertsFactualRisk = /claims? that|states? that|factual claim|statistic|price|discount|offer|guarantee|testimonial|is located|is available|includes? the|provides? the|measurable outcome/.test(normalized);
  if (looksIllustrative && !assertsFactualRisk) return 'creative_example';
  const subjectiveDeliverableCritique = requested === 'deliverable_contract'
    && /generic|repetitive|more useful|useful article|placeholder|does not answer the brief/.test(normalized)
    && !/wrong count|missing|required field|empty required|does not contain the required/.test(normalized);
  if (subjectiveDeliverableCritique) return 'polish';
  if (qaFindingCategories.includes(requested)) return requested;
  if (/deliverable|wrong count|count (?:does not|doesn't|fails to) match|required \d+|missing \d+/.test(normalized)) return 'deliverable_contract';
  if (/missing required|required field|empty required|does not contain the required|no usable keyword list/.test(normalized)) return 'required_field';
  if (/unsupported|unconfirmed|unverified|invented|fabricated/.test(normalized)
    && /claim|statistic|number|price|offer|discount|testimonial|guarantee|outcome|availability|benefit|fact/.test(normalized)) return 'unsupported_claim';
  if (/wrong (?:brand|product|offering)|different (?:brand|product|offering)|unrelated (?:brand|product|business)|brand mismatch|product mismatch/.test(normalized)) return 'brand_or_product';
  if (/unsafe|safety|medical claim|legal claim|financial claim|identifiable private|privacy/.test(normalized)) return 'safety';
  if (/character limit|over.{0,20}(?:character|length) limit|aspect ratio|unsupported platform|invalid platform|required platform field|platform limit/.test(normalized)) return 'platform_limit';
  if (/\bcta\b|call to action|conversion action|requested action|wrong action|next action/.test(normalized)) return 'cta';
  if (/city|cities|daily[- ]life|scene|scenario|situation|mood|metaphor|illustrative|visual example|creative example/.test(normalized)) return 'creative_example';
  return 'polish';
}

function normalizeQaFindingSeverity(
  input: QaFinding['severity'],
  category: QaFindingCategory,
): QaFinding['severity'] {
  const requested = ['note', 'warning', 'blocking'].includes(input) ? input : 'warning';
  if (category === 'creative_example' || category === 'polish') return 'note';
  if (requested === 'blocking' && !blockingQaCategories.has(category)) return 'warning';
  return requested;
}

export function normalizeContentPatches(input: unknown): ContentPatch[] {
  const record = asRecord(input);
  const raw = Array.isArray(record.patches) ? record.patches : [];
  return raw.map((item) => {
    const value = asRecord(item);
    const group = stringValue(value.group) as ContentPatch['group'];
    if (!['socialPosts', 'googleAds', 'socialAds', 'blogOutlines'].includes(group)) return null;
    const field = stringValue(value.field);
    if (!field) return null;
    return {
      group,
      index: numberValue(value.index),
      field,
      value: value.value,
      reason: compact(stringValue(value.reason), 400),
    } satisfies ContentPatch;
  }).filter((item): item is ContentPatch => !!item).slice(0, 30);
}

export function brandInstructionsText(value: BrandInstructions): string {
  return [
    section('Hard brand rules', value.hardRules),
    section('Tone rules', value.toneRules),
    section('Approved terminology', value.approvedTerms),
    section('Prohibited terminology', value.prohibitedTerms),
    section('Approved brand facts', value.approvedFacts),
    section('Conflicts to avoid', value.conflicts),
    section('Useful writing patterns', value.examplePatterns),
  ].filter(Boolean).join('\n\n');
}

export function researchBriefText(value: ResearchBrief): string {
  return value.findings.map((finding, index) => [
    `${index + 1}. ${finding.claim}`,
    `Source numbers: ${finding.sourceNumbers.join(', ') || 'none recorded'}`,
    `Confidence: ${finding.confidence}; public use: ${finding.publicUse}`,
    finding.campaignUse ? `Campaign use: ${finding.campaignUse}` : '',
  ].filter(Boolean).join(' ')).join('\n');
}

export function creativeDirectionText(value: CreativeDirection): string {
  return [
    `Campaign idea: ${value.centralIdea}`,
    value.audienceProblem ? `Audience problem: ${value.audienceProblem}` : '',
    value.promise ? `Promise: ${value.promise}` : '',
    section('Key messages', value.keyMessages),
    section('Calls to action', value.callsToAction),
    section('Distinct content angles', value.contentAngles),
    Object.keys(value.platformGuidance).length
      ? `Platform guidance:\n${Object.entries(value.platformGuidance).map(([key, guidance]) => `- ${key}: ${guidance}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n');
}

function normalizeResearchFinding(input: unknown): ResearchFinding | null {
  const record = asRecord(input);
  const claim = compact(stringValue(record.claim), 600);
  if (!claim) return null;
  const confidence = stringValue(record.confidence) as ResearchFinding['confidence'];
  const publicUse = stringValue(record.publicUse) as ResearchFinding['publicUse'];
  return {
    claim,
    sourceNumbers: numberArray(record.sourceNumbers).slice(0, 8),
    confidence: ['high', 'medium', 'low'].includes(confidence) ? confidence : 'medium',
    publicUse: publicUse === 'safe' ? 'safe' : 'caution',
    campaignUse: compact(stringValue(record.campaignUse), 400),
  };
}

function section(title: string, values: string[]) {
  return values.length ? `${title}:\n${values.map((value) => `- ${value}`).join('\n')}` : '';
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}

function stringValue(input: unknown): string {
  if (typeof input === 'string') return repairMojibake(input.trim());
  if (typeof input === 'number' || typeof input === 'boolean') return String(input);
  return '';
}

function extractKeywordTargets(input: string): string[] {
  const values: string[] = [];
  const addList = (value: string) => {
    values.push(...value
      .split(/\s*(?:,|;|\band\b)\s*/i)
      .map((item) => item.replace(/^[-*\d.)\s'"“”‘’]+|['"“”‘’\s]+$/g, '').trim())
      .filter((item) => item.length >= 2 && item.length <= 100));
  };

  const lines = input.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const marker = lines[index].match(/^\s*(?:target\s+|search\s+)?keywords?\s*:\s*(.*)$/i);
    if (!marker) continue;
    if (marker[1]) addList(marker[1]);
    for (let next = index + 1; next < lines.length; next += 1) {
      const bullet = lines[next].match(/^\s*[-*]\s+(.+)$/);
      if (!bullet) break;
      addList(bullet[1]);
    }
  }

  for (const match of input.matchAll(/\b(?:target\s+|search\s+)?keywords?\s*(?:are|include|includes|:|-)\s*([^.!?\n]+)/gi)) {
    addList(match[1]);
  }

  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, 50);
}

function keywordArray(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(stringValue).filter(Boolean);
  if (typeof input === 'string') return input.split(/\n|,|;/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function stringArray(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(stringValue).filter(Boolean);
  if (typeof input === 'string') return input.split(/\n|;/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function numberArray(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  return input.map(numberValue).filter((value) => value >= 0);
}

function numberValue(input: unknown): number {
  const value = typeof input === 'number' ? input : Number(input);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function booleanValue(input: unknown, fallback: boolean): boolean {
  return typeof input === 'boolean' ? input : fallback;
}

function compact(input: string, maxLength: number) {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const candidate = normalized.slice(0, Math.max(1, maxLength - 1));
  const wordBoundary = candidate.lastIndexOf(' ');
  const clipped = wordBoundary >= Math.floor(maxLength * 0.65)
    ? candidate.slice(0, wordBoundary)
    : candidate;
  return `${clipped.trim()}…`;
}

function conciseOffering(input: string) {
  const normalized = input.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const offering = normalized.match(/\b(?:offering|offers|provides)\s+([^.!;]+)/i)?.[1]?.trim();
  return compact(offering || normalized.split(/[.!;]/)[0] || 'the verified offering', 150);
}

function conciseFact(input: string) {
  const withoutLabel = input.replace(/^\s*[^:]{1,80}:\s*/, '').trim();
  return compact(withoutLabel.split(/[.!?]/)[0] || withoutLabel, 170);
}

function sentenceMatch(input: string, pattern: RegExp) {
  return compact(input.match(pattern)?.[1] || '', 400);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
import { repairMojibake } from './text_encoding.ts';
