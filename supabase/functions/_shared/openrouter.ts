import { getRequiredSecret } from './http.ts';
import { parseJsonContent } from './json.ts';
import { structuredOutputReasoning, supportsTemperatureParameter } from './openrouter_policy.ts';
import { captureOpenRouterGeneration, type AiObservabilityContext } from './posthog_ai.ts';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OpenRouterResponse = Record<string, unknown> & {
  id?: string;
  model?: string;
  usage?: unknown;
  error?: string | { message?: string };
  choices?: Array<{
    message?: {
      content?: string;
      annotations?: Array<{
        type?: string;
        url_citation?: {
          url?: string;
          title?: string;
          content?: string;
        };
      }>;
    };
    finish_reason?: string;
  }>;
};

export type OpenRouterUrlCitation = {
  url: string;
  title: string;
  content: string;
};

export async function openRouterJson<T>({
  messages,
  model = 'deepseek/deepseek-v4-flash',
  temperature = 0.4,
  maxTokens,
  timeoutMs = 150_000,
  jsonMode = true,
  observability,
}: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
  observability?: AiObservabilityContext;
}): Promise<T> {
  const effectiveTemperature = supportsTemperatureParameter(model) ? temperature : undefined;
  const reasoning = structuredOutputReasoning(model);
  const body = {
    model,
    messages,
    ...(effectiveTemperature !== undefined ? { temperature: effectiveTemperature } : {}),
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(jsonMode ? {
      response_format: { type: 'json_object' },
      plugins: [{ id: 'response-healing' }],
      provider: { require_parameters: true, sort: 'throughput' },
    } : {}),
  };
  let attempt = await fetchOpenRouter({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getRequiredSecret('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://socialsuite.app',
      'X-Title': 'Social Suite',
    },
    body: JSON.stringify(body),
  }, timeoutMs);
  assertNetworkAttempt(attempt, { body, messages, model, temperature: effectiveTemperature, maxTokens, jsonMode, observability });

  if (!attempt.response.ok && jsonMode && [400, 422].includes(attempt.response.status)) {
    captureAttempt({
      attempt,
      body,
      messages,
      model,
      temperature: effectiveTemperature,
      maxTokens,
      jsonMode,
      observability: withAttempt(observability, 'json-mode-rejected'),
      error: openRouterError(attempt),
      parseSucceeded: false,
    });
    attempt = await fetchOpenRouter({
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
        ...(effectiveTemperature !== undefined ? { temperature: effectiveTemperature } : {}),
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        ...(reasoning ? { reasoning } : {}),
      }),
    }, timeoutMs);
    assertNetworkAttempt(attempt, { body, messages, model, temperature: effectiveTemperature, maxTokens, jsonMode: false, observability });
  }

  if (!attempt.response.ok) {
    const error = openRouterError(attempt);
    captureAttempt({
      attempt,
      body,
      messages,
      model,
      temperature: effectiveTemperature,
      maxTokens,
      jsonMode,
      observability,
      error,
      parseSucceeded: false,
    });
    throw new Error(error);
  }

  const data = attempt.data;
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    const error = 'OpenRouter returned an empty response';
    captureAttempt({ attempt, body, messages, model, temperature: effectiveTemperature, maxTokens, jsonMode, observability, error, parseSucceeded: false });
    throw new Error(error);
  }

  try {
    const parsed = parseJsonContent<T>(content);
    captureAttempt({ attempt, body, messages, model, temperature: effectiveTemperature, maxTokens, jsonMode, observability, output: content, parseSucceeded: true });
    return parsed;
  } catch (error) {
    captureAttempt({
      attempt,
      body,
      messages,
      model,
      temperature: effectiveTemperature,
      maxTokens,
      jsonMode,
      observability,
      output: content,
      error: error instanceof Error ? error.message : 'OpenRouter returned invalid JSON',
      parseSucceeded: false,
    });
    throw error;
  }
}

export async function openRouterText({
  messages,
  model = 'deepseek/deepseek-v4-flash',
  temperature = 0.3,
  timeoutMs = 120_000,
  observability,
}: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  observability?: AiObservabilityContext;
}) {
  const body = { model, messages, temperature };
  const attempt = await fetchOpenRouter({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getRequiredSecret('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://socialsuite.app',
      'X-Title': 'Social Suite',
    },
    body: JSON.stringify(body),
  }, timeoutMs);
  assertNetworkAttempt(attempt, { body, messages, model, temperature, observability });

  if (!attempt.response.ok) {
    const error = openRouterError(attempt);
    captureAttempt({ attempt, body, messages, model, temperature, observability, error });
    throw new Error(error);
  }

  const content = String(attempt.data?.choices?.[0]?.message?.content || '').trim();
  if (!content) {
    const error = 'OpenRouter returned an empty response';
    captureAttempt({ attempt, body, messages, model, temperature, observability, error });
    throw new Error(error);
  }
  captureAttempt({ attempt, body, messages, model, temperature, observability, output: content, parseSucceeded: true });
  return content;
}

export async function openRouterTextWithCitations({
  messages,
  model,
  temperature = 0.3,
  maxTokens,
  timeoutMs = 120_000,
  observability,
}: {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  observability?: AiObservabilityContext;
}): Promise<{ content: string; citations: OpenRouterUrlCitation[] }> {
  const effectiveTemperature = supportsTemperatureParameter(model) ? temperature : undefined;
  const body = {
    model,
    messages,
    ...(effectiveTemperature !== undefined ? { temperature: effectiveTemperature } : {}),
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
  };
  const attempt = await fetchOpenRouter({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getRequiredSecret('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://socialsuite.app',
      'X-Title': 'Social Suite',
    },
    body: JSON.stringify(body),
  }, timeoutMs);
  assertNetworkAttempt(attempt, { body, messages, model, temperature: effectiveTemperature, maxTokens, jsonMode: false, observability });

  if (!attempt.response.ok) {
    const error = openRouterError(attempt);
    captureAttempt({ attempt, body, messages, model, temperature: effectiveTemperature, maxTokens, jsonMode: false, observability, error });
    throw new Error(error);
  }

  const content = String(attempt.data?.choices?.[0]?.message?.content || '').trim();
  if (!content) {
    const error = 'OpenRouter returned an empty response';
    captureAttempt({ attempt, body, messages, model, temperature: effectiveTemperature, maxTokens, jsonMode: false, observability, error });
    throw new Error(error);
  }

  const citations = (attempt.data?.choices?.[0]?.message?.annotations || [])
    .filter((annotation) => annotation?.type === 'url_citation' && annotation.url_citation?.url)
    .map((annotation) => ({
      url: String(annotation.url_citation?.url || '').trim(),
      title: String(annotation.url_citation?.title || annotation.url_citation?.url || '').trim(),
      content: String(annotation.url_citation?.content || '').trim(),
    }))
    .filter((citation, index, all) => citation.url && all.findIndex((item) => item.url === citation.url) === index)
    .slice(0, 5);

  captureAttempt({
    attempt,
    body,
    messages,
    model,
    temperature: effectiveTemperature,
    maxTokens,
    jsonMode: false,
    observability,
    output: content,
    parseSucceeded: true,
  });
  return { content, citations };
}

async function fetchOpenRouter(init: RequestInit, timeoutMs: number): Promise<OpenRouterAttempt> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      ...init,
      signal: controller.signal,
    });
    let data: OpenRouterResponse;
    try {
      data = await response.json() as OpenRouterResponse;
    } catch (error) {
      if (controller.signal.aborted) throw error;
      data = {} as OpenRouterResponse;
    }
    return { response, data, latencyMs: performance.now() - startedAt };
  } catch (error) {
    if ((error as Error)?.name === 'TimeoutError' || (error as Error)?.name === 'AbortError') {
      return {
        response: new Response(null, { status: 599 }),
        data: {} as OpenRouterResponse,
        latencyMs: performance.now() - startedAt,
        networkError: `OpenRouter request timed out after ${Math.round(timeoutMs / 1000)}s`,
      };
    }
    return {
      response: new Response(null, { status: 599 }),
      data: {} as OpenRouterResponse,
      latencyMs: performance.now() - startedAt,
      networkError: error instanceof Error ? error.message : 'OpenRouter network request failed',
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

type OpenRouterAttempt = {
  response: Response;
  data: OpenRouterResponse;
  latencyMs: number;
  networkError?: string;
};

function assertNetworkAttempt(
  attempt: OpenRouterAttempt,
  details: {
    body: Record<string, unknown>;
    messages: ChatMessage[];
    model: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    observability?: AiObservabilityContext;
  },
) {
  if (!attempt.networkError) return;
  captureAttempt({
    attempt,
    ...details,
    error: attempt.networkError,
    parseSucceeded: false,
  });
  throw new Error(attempt.networkError);
}

function captureAttempt({
  attempt,
  messages,
  model,
  temperature,
  maxTokens,
  jsonMode,
  observability,
  output,
  error,
  parseSucceeded,
}: {
  attempt: OpenRouterAttempt;
  body: Record<string, unknown>;
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  observability?: AiObservabilityContext;
  output?: string;
  error?: string;
  parseSucceeded?: boolean;
}) {
  captureOpenRouterGeneration({
    messages,
    requestedModel: model,
    responseModel: typeof attempt.data?.model === 'string' ? attempt.data.model : undefined,
    temperature,
    maxTokens,
    response: attempt.data,
    output,
    latencyMs: attempt.latencyMs,
    httpStatus: attempt.response.status,
    error,
    stopReason: attempt.data?.choices?.[0]?.finish_reason,
    jsonMode,
    parseSucceeded,
    observability,
  });
}

function openRouterError(attempt: OpenRouterAttempt) {
  const payloadError = attempt.data?.error;
  const detail = typeof payloadError === 'string'
    ? payloadError
    : typeof payloadError?.message === 'string'
      ? payloadError.message
      : JSON.stringify(attempt.data || {}).slice(0, 500);
  return `OpenRouter request failed: ${attempt.response.status} ${detail}`.trim();
}

function withAttempt(observability: AiObservabilityContext | undefined, attempt: string): AiObservabilityContext {
  return {
    ...(observability || {}),
    properties: {
      ...(observability?.properties || {}),
      socialsuite_attempt: attempt,
    },
  };
}
