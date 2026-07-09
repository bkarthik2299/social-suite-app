import { getRequiredSecret } from './http.ts';
import { parseJsonContent } from './json.ts';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function openRouterJson<T>({
  messages,
  model = 'deepseek/deepseek-v4-flash',
  temperature = 0.4,
  maxTokens,
  timeoutMs = 150_000,
  jsonMode = true,
}: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
}): Promise<T> {
  const body = {
    model,
    messages,
    temperature,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
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

  if (!response.ok && jsonMode && [400, 422].includes(response.status)) {
    response = await fetchOpenRouter({
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getRequiredSecret('OPENROUTER_API_KEY')}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://socialsuite.app',
        'X-Title': 'Social Suite',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
      }),
    }, timeoutMs);
  }

  if (!response.ok) {
    const text = await response.text();
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
  const nativeTimeoutSignal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : null;
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
      signal: nativeTimeoutSignal || controller.signal,
    });

    return await Promise.race([request, timeout]);
  } catch (error) {
    if ((error as Error)?.name === 'TimeoutError' || (error as Error)?.name === 'AbortError') {
      throw new Error(`OpenRouter request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
