import { getRequiredSecret } from './http.ts';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function openRouterJson<T>({
  messages,
  model = 'deepseek/deepseek-v4-flash',
  temperature = 0.4,
  timeoutMs = 150_000,
}: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<T> {
  const body = {
    model,
    messages,
    temperature,
    response_format: { type: 'json_object' },
  };
  let response = await fetchOpenRouter({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getRequiredSecret('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://socialsuite.app',
      'X-Title': 'Social Suite',
    },
    body: JSON.stringify(body),
  }, timeoutMs);

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 400 && text.includes('response_format')) {
      const bodyWithoutResponseFormat = { model, messages, temperature };
      response = await fetchOpenRouter({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getRequiredSecret('OPENROUTER_API_KEY')}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://socialsuite.app',
          'X-Title': 'Social Suite',
        },
        body: JSON.stringify(bodyWithoutResponseFormat),
      }, timeoutMs);

      if (response.ok) {
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content || typeof content !== 'string') {
          throw new Error('OpenRouter returned an empty response');
        }
        return parseJsonContent<T>(content);
      }

      const retryText = await response.text();
      throw new Error(`OpenRouter request failed: ${response.status} ${retryText.slice(0, 500)}`);
    }
    throw new Error(`OpenRouter request failed: ${response.status} ${text.slice(0, 500)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('OpenRouter returned an empty response');
  }

  return parseJsonContent<T>(content);
}

export async function openRouterText({
  messages,
  model = 'deepseek/deepseek-v4-flash',
  temperature = 0.3,
  timeoutMs = 120_000,
}: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  timeoutMs?: number;
}) {
  const response = await fetchOpenRouter({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getRequiredSecret('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://socialsuite.app',
      'X-Title': 'Social Suite',
    },
    body: JSON.stringify({ model, messages, temperature }),
  }, timeoutMs);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${text.slice(0, 500)}`);
  }

  const data = await response.json();
  return String(data?.choices?.[0]?.message?.content || '').trim();
}

async function fetchOpenRouter(init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`OpenRouter request timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
  });

  try {
    const request = fetch('https://openrouter.ai/api/v1/chat/completions', {
      ...init,
      signal: controller.signal,
    });

    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function parseJsonContent<T>(content: string): T {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const candidate = fenced || trimmed;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    const objectStart = candidate.indexOf('{');
    const objectEnd = candidate.lastIndexOf('}');
    const arrayStart = candidate.indexOf('[');
    const arrayEnd = candidate.lastIndexOf(']');
    const objectCandidate = objectStart >= 0 && objectEnd > objectStart
      ? candidate.slice(objectStart, objectEnd + 1)
      : '';
    const arrayCandidate = arrayStart >= 0 && arrayEnd > arrayStart
      ? candidate.slice(arrayStart, arrayEnd + 1)
      : '';

    for (const value of [objectCandidate, arrayCandidate]) {
      if (!value) continue;
      try {
        return JSON.parse(value) as T;
      } catch {
        // Continue trying other JSON-looking sections before failing.
      }
    }
  }

  throw new Error('OpenRouter returned invalid JSON');
}
