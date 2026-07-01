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
      title: typeof item.title === 'string' && item.title ? item.title : item.url,
      url: item.url,
      score: typeof item.score === 'number' ? item.score : undefined,
      content: typeof item.content === 'string' ? item.content : undefined,
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
  return typeof value === 'string' ? value.trim() : '';
}

export function sanitizeActivityText(value: string) {
  return value
    .replace(/Tavily/gi, 'web research')
    .replace(/OpenRouter model\s+\S+/gi, 'the selected AI route')
    .replace(/OpenRouter/gi, 'AI generation');
}

function eventTimestamp(event: AiRunEvent) {
  const timestamp = event.created_at ? new Date(event.created_at).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function handoffSections(value: unknown): HandoffDisplaySection[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((section) => {
    if (!isRecord(section)) return [];
    const title = typeof section.title === 'string' ? section.title.trim() : '';
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
