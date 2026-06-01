import { getRequiredSecret } from './http.ts';

export type TavilyResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

export type TavilySearchResponse = {
  query: string;
  answer: string;
  results: TavilyResult[];
  responseTime?: string;
  credits?: number;
};

type TavilyResultRecord = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  score?: unknown;
};

export async function tavilySearch(query: string): Promise<TavilySearchResponse> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getRequiredSecret('TAVILY_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      search_depth: 'advanced',
      include_answer: false,
      include_raw_content: false,
      max_results: 5,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tavily search failed: ${response.status} ${text.slice(0, 300)}`);
  }

  const payload = await response.json();
  const results = Array.isArray(payload.results)
    ? payload.results.map(normalizeResult).filter((item): item is TavilyResult => !!item)
    : [];

  return {
    query: String(payload.query || query),
    answer: String(payload.answer || ''),
    results,
    responseTime: payload.response_time ? String(payload.response_time) : undefined,
    credits: typeof payload.usage?.credits === 'number' ? payload.usage.credits : undefined,
  };
}

export function tavilyContext(search: TavilySearchResponse) {
  const sourceLines = search.results.map((item, index) => {
    const content = item.content ? ` - ${item.content}` : '';
    return `${index + 1}. ${item.title} (${item.url})${content}`;
  });

  return [
    `Research query: ${search.query}`,
    search.answer ? `Research summary: ${search.answer}` : '',
    sourceLines.length ? `Sources:\n${sourceLines.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

function normalizeResult(input: TavilyResultRecord): TavilyResult | null {
  const title = stringValue(input.title);
  const url = stringValue(input.url);
  if (!url) return null;

  const score = typeof input.score === 'number' ? input.score : undefined;
  return {
    title: title || url,
    url,
    content: stringValue(input.content),
    score,
  };
}

function stringValue(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (typeof input === 'number' || typeof input === 'boolean') return String(input);
  return '';
}
