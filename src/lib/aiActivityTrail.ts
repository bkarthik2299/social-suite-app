import type { AiRunEvent } from '@/types/ai';

export type HandoffDisplaySection = {
  title: string;
  body: string | string[];
};

export type HandoffDisplayDetails = {
  title: string;
  summary: string;
  agentName: string;
  nextAgent: string;
  sections: HandoffDisplaySection[];
  metrics: Array<{ label: string; value: string }>;
  sources: Array<{ title: string; url: string; score?: number; content?: string }>;
};

export function activityTrailEvents(events: AiRunEvent[], latestLimit: number) {
  const selected = new Map<string, AiRunEvent>();
  for (const event of events) {
    if (event.event_type === 'agent_handoff') selected.set(event.id, event);
  }
  for (const event of events.slice(-latestLimit)) {
    selected.set(event.id, event);
  }
  return Array.from(selected.values()).sort((left, right) => eventTimestamp(right) - eventTimestamp(left));
}

export function eventSources(event: AiRunEvent): Array<{ title: string; url: string; score?: number; content?: string }> {
  const sources = event.payload?.sources;
  if (!Array.isArray(sources)) return [];

  return sources.flatMap((source) => {
    if (!source || typeof source !== 'object') return [];
    const item = source as { title?: unknown; url?: unknown; score?: unknown; content?: unknown };
    if (typeof item.url !== 'string' || !item.url) return [];
    return [{
      title: repairMojibake(typeof item.title === 'string' && item.title ? item.title : item.url),
      url: item.url,
      score: typeof item.score === 'number' ? item.score : undefined,
      content: typeof item.content === 'string' ? repairMojibake(item.content) : undefined,
    }];
  });
}

export function eventHandoffDetails(event: AiRunEvent): HandoffDisplayDetails | null {
  if (event.event_type !== 'agent_handoff') return null;
  const title = payloadString(event, 'title') || 'Agent handoff';
  const agentName = payloadString(event, 'agentName') || 'AI agent';
  const summary = payloadString(event, 'summary') || event.message || `${agentName} prepared context for the next step.`;

  return {
    title,
    agentName,
    summary: sanitizeActivityText(summary),
    nextAgent: payloadString(event, 'nextAgent'),
    sections: handoffSections(event.payload?.sections),
    metrics: handoffMetricEntries(event.payload?.metrics),
    sources: eventSources(event),
  };
}

export function payloadString(event: AiRunEvent | null, key: string) {
  const value = event?.payload?.[key];
  return typeof value === 'string' ? repairMojibake(value.trim()) : '';
}

export function sanitizeActivityText(value: string) {
  return repairMojibake(value)
    .replace(/Tavily\s+research/gi, 'web research')
    .replace(/Tavily/gi, 'web research')
    .replace(/OpenRouter model\s+\S+/gi, 'the selected AI route')
    .replace(/OpenRouter/gi, 'AI generation');
}

/** Repairs UTF-8 punctuation that was accidentally decoded as Windows-1252. */
export function repairMojibake(value: string) {
  let repaired = value;
  for (let pass = 0; pass < 2; pass += 1) {
    let changed = false;
    let next = '';
    for (let index = 0; index < repaired.length;) {
      if (!/[ÃÂâðï]/.test(repaired[index])) {
        next += repaired[index];
        index += 1;
        continue;
      }

      let replacement = '';
      let consumed = 0;
      for (let length = 2; length <= 4 && index + length <= repaired.length; length += 1) {
        const candidate = repaired.slice(index, index + length);
        const bytes = windows1252Bytes(candidate);
        if (!bytes) continue;
        try {
          const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          if (decoded && mojibakeScore(decoded) < mojibakeScore(candidate)) {
            replacement = decoded;
            consumed = length;
            break;
          }
        } catch {
          // Try the next candidate length.
        }
      }

      if (replacement) {
        next += replacement;
        index += consumed;
        changed = true;
      } else {
        next += repaired[index];
        index += 1;
      }
    }
    repaired = next;
    if (!changed) break;
  }
  return repaired;
}

const windows1252CodePoints = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

function windows1252Bytes(value: string) {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0) || 0;
    if (codePoint <= 0xff) bytes.push(codePoint);
    else if (windows1252CodePoints.has(codePoint)) bytes.push(windows1252CodePoints.get(codePoint)!);
    else return null;
  }
  return Uint8Array.from(bytes);
}

function mojibakeScore(value: string) {
  return (value.match(/[ÃÂâðï�]/g) || []).length;
}

function eventTimestamp(event: AiRunEvent) {
  const timestamp = event.created_at ? new Date(event.created_at).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function handoffSections(value: unknown): HandoffDisplaySection[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((section) => {
    if (!isRecord(section)) return [];
    const title = typeof section.title === 'string' ? repairMojibake(section.title.trim()) : '';
    const body = handoffSectionBody(section.body);
    if (!title || (Array.isArray(body) ? body.length === 0 : !body)) return [];
    return [{ title, body }];
  });
}

function handoffSectionBody(value: unknown): string | string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? sanitizeActivityText(item.trim()) : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') return sanitizeActivityText(value.trim());
  return '';
}

function handoffMetricEntries(value: unknown): Array<{ label: string; value: string }> {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, metricValue]) => {
    const formatted = formatMetricValue(metricValue);
    if (!formatted) return [];
    return [{ label: formatMetricLabel(key), value: formatted }];
  }).slice(0, 10);
}

function formatMetricValue(value: unknown): string {
  if (typeof value === 'string') return sanitizeActivityText(value.trim());
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => formatMetricValue(item))
      .filter(Boolean)
      .join(', ');
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, nestedValue]) => {
        const formatted = formatMetricValue(nestedValue);
        return formatted ? `${formatMetricLabel(key)}: ${formatted}` : '';
      })
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

function formatMetricLabel(value: string) {
  const spaced = value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
