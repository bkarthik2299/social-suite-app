import { getRequiredSecret } from './http.ts';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function openRouterJson<T>({
  messages,
  model = Deno.env.get('AI_DEFAULT_MODEL') || 'deepseek/deepseek-v4-flash',
  temperature = 0.4,
}: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
}): Promise<T> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${text.slice(0, 500)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('OpenRouter returned an empty response');
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error('OpenRouter returned invalid JSON');
  }
}

export async function openRouterText({
  messages,
  model = Deno.env.get('AI_DEFAULT_MODEL') || 'deepseek/deepseek-v4-flash',
  temperature = 0.3,
}: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
}) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getRequiredSecret('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://socialsuite.app',
      'X-Title': 'Social Suite',
    },
    body: JSON.stringify({ model, messages, temperature }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${text.slice(0, 500)}`);
  }

  const data = await response.json();
  return String(data?.choices?.[0]?.message?.content || '').trim();
}
