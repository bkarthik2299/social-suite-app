import { sanitizeActivityText } from './aiActivityTrail';

export type ResearchNoteFinding = {
  claim: string;
  sourceNumbers: number[];
  confidence: 'high' | 'medium' | 'low' | '';
  publicUse: 'safe' | 'caution' | '';
  campaignUse: string;
};

export function researchNoteFindings(evidenceBrief: unknown, answer: string): ResearchNoteFinding[] {
  const evidence = asRecord(evidenceBrief);
  const structured = Array.isArray(evidence.findings)
    ? evidence.findings.map(normalizeFinding).filter((finding): finding is ResearchNoteFinding => !!finding)
    : [];

  return structured.length ? structured : parseResearchAnswer(answer);
}

export function formatResearchCampaignFocus(input: string) {
  return sanitizeActivityText(input)
    .replace(/\s+/g, ' ')
    .replace(/\s+(Offering|Audience|Desired action|Campaign plan|Objective|Requested outputs|Restrictions|Assumptions):\s*/gi, '\n\n$1: ')
    .replace(/\s+Audience should be treated as\s+/i, '\n\nAudience details: ')
    .replace(/\s+Keep the tone\s+/i, '\n\nTone: ')
    .replace(/\s+The output should\s+/i, '\n\nOutput requirements: The output should ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseResearchAnswer(answer: string): ResearchNoteFinding[] {
  const value = answer.replace(/\r\n/g, '\n').trim();
  if (!value) return [];

  const numbered = [...value.matchAll(/(?:^|\n)\s*\d+\.\s+([\s\S]*?)(?=\n\s*\d+\.\s+|$)/g)]
    .map((match) => normalizeTextFinding(match[1]));
  if (numbered.length) return numbered.filter((finding): finding is ResearchNoteFinding => !!finding);

  return value
    .split(/\n{2,}|;\s+(?=[A-Z])/)
    .map(normalizeTextFinding)
    .filter((finding): finding is ResearchNoteFinding => !!finding);
}

function normalizeFinding(input: unknown): ResearchNoteFinding | null {
  const value = asRecord(input);
  const claim = stringValue(value.claim);
  if (!claim) return null;
  const confidence = stringValue(value.confidence).toLowerCase();
  const publicUse = stringValue(value.publicUse).toLowerCase();
  return {
    claim,
    sourceNumbers: numberArray(value.sourceNumbers),
    confidence: isConfidence(confidence) ? confidence : '',
    publicUse: isPublicUse(publicUse) ? publicUse : '',
    campaignUse: stringValue(value.campaignUse),
  };
}

function normalizeTextFinding(input: string): ResearchNoteFinding | null {
  const value = sanitizeActivityText(input).replace(/\s+/g, ' ').trim();
  if (!value) return null;
  const sourceMatch = value.match(/\bSource numbers?:\s*([\d,\s]+)/i);
  const confidenceMatch = value.match(/\bConfidence:\s*(high|medium|low)\b/i);
  const publicUseMatch = value.match(/\bpublic use:\s*(safe|caution)\b/i);
  const campaignUseMatch = value.match(/\bCampaign use:\s*(.+)$/i);
  const claim = value
    .replace(/\s*Source numbers?:[\s\S]*$/i, '')
    .replace(/^\d+\.\s*/, '')
    .trim();
  if (!claim) return null;
  return {
    claim,
    sourceNumbers: sourceMatch?.[1].split(',').map((item) => Number(item.trim())).filter(Number.isFinite) || [],
    confidence: (confidenceMatch?.[1].toLowerCase() as ResearchNoteFinding['confidence']) || '',
    publicUse: (publicUseMatch?.[1].toLowerCase() as ResearchNoteFinding['publicUse']) || '',
    campaignUse: campaignUseMatch?.[1].trim() || '',
  };
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}

function stringValue(input: unknown) {
  return typeof input === 'string' ? sanitizeActivityText(input).replace(/\s+/g, ' ').trim() : '';
}

function numberArray(input: unknown) {
  return Array.isArray(input)
    ? input.map((item) => Number(item)).filter(Number.isFinite)
    : [];
}

function isConfidence(value: string): value is ResearchNoteFinding['confidence'] {
  return value === 'high' || value === 'medium' || value === 'low';
}

function isPublicUse(value: string): value is ResearchNoteFinding['publicUse'] {
  return value === 'safe' || value === 'caution';
}
