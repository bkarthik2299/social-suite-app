type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: unknown;
};

export type AiObservabilityContext = {
  distinctId?: string;
  traceId?: string;
  sessionId?: string;
  spanName?: string;
  feature?: string;
  properties?: Record<string, unknown>;
};

export type OpenRouterGeneration = {
  messages: ChatMessage[];
  requestedModel: string;
  responseModel?: string;
  temperature?: number;
  maxTokens?: number;
  response?: Record<string, unknown>;
  output?: string;
  latencyMs: number;
  httpStatus?: number;
  error?: string;
  stopReason?: string;
  jsonMode?: boolean;
  parseSucceeded?: boolean;
  observability?: AiObservabilityContext;
};

export type AiTrace = {
  distinctId: string;
  traceId: string;
  sessionId?: string;
  traceName: string;
  latencyMs: number;
  isError?: boolean;
  error?: string;
  properties?: Record<string, unknown>;
};

type OpenRouterUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
};

const captureEndpoint = () => {
  const host = (Deno.env.get('POSTHOG_HOST') || 'https://us.i.posthog.com').replace(/\/+$/, '');
  return `${host}/i/v0/e/`;
};

const projectToken = () =>
  Deno.env.get('POSTHOG_PROJECT_TOKEN') || Deno.env.get('POSTHOG_API_KEY') || '';

const contentCaptureEnabled = () =>
  Deno.env.get('POSTHOG_AI_CAPTURE_CONTENT')?.toLowerCase() === 'true';

const appEnvironment = () =>
  Deno.env.get('APP_ENV') || Deno.env.get('ENVIRONMENT') || 'production';

export function captureOpenRouterGeneration(generation: OpenRouterGeneration) {
  const token = projectToken();
  if (!token) return;

  const usage = readUsage(generation.response?.usage);
  const context = generation.observability || {};
  const distinctId = context.distinctId || 'socialsuite-server';
  const traceId = safeId(context.traceId) || crypto.randomUUID();
  const spanId = crypto.randomUUID();
  const isError = Boolean(generation.error);
  const properties: Record<string, unknown> = {
    distinct_id: distinctId,
    $ai_trace_id: traceId,
    $ai_span_id: spanId,
    $ai_span_name: context.spanName || context.feature || 'openrouter.chat.completions',
    $ai_model: generation.responseModel || generation.requestedModel,
    $ai_provider: 'openrouter',
    $ai_base_url: 'https://openrouter.ai/api/v1',
    $ai_request_url: 'https://openrouter.ai/api/v1/chat/completions',
    $ai_latency: generation.latencyMs / 1000,
    $ai_http_status: generation.httpStatus,
    $ai_is_error: isError,
    $ai_error: generation.error || undefined,
    $ai_input_tokens: usage.prompt_tokens,
    $ai_output_tokens: usage.completion_tokens,
    $ai_total_cost_usd: usage.cost,
    $ai_cache_read_input_tokens: usage.prompt_tokens_details?.cached_tokens,
    $ai_cache_creation_input_tokens: usage.prompt_tokens_details?.cache_write_tokens,
    $ai_cache_reporting_exclusive: false,
    $ai_stop_reason: generation.stopReason,
    $ai_temperature: generation.temperature,
    $ai_max_tokens: generation.maxTokens,
    $ai_stream: false,
    socialsuite_feature: context.feature || 'uncategorized',
    socialsuite_environment: appEnvironment(),
    socialsuite_json_mode: Boolean(generation.jsonMode),
    socialsuite_parse_succeeded: generation.parseSucceeded,
    socialsuite_openrouter_generation_id: stringValue(generation.response?.id),
    socialsuite_reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens,
    socialsuite_observability_version: 1,
    ...context.properties,
  };

  if (context.sessionId) properties.$ai_session_id = safeId(context.sessionId);
  if (contentCaptureEnabled()) {
    properties.$ai_input = sanitizeMessages(generation.messages);
    properties.$ai_output_choices = generation.output
      ? [{ role: 'assistant', content: truncate(generation.output, 40_000) }]
      : [];
  }

  scheduleCapture({
    api_key: token,
    distinct_id: distinctId,
    event: '$ai_generation',
    properties: compact(properties),
    timestamp: new Date().toISOString(),
  });
}

export function captureAiTrace(trace: AiTrace) {
  const token = projectToken();
  if (!token) return;

  const properties: Record<string, unknown> = {
    distinct_id: trace.distinctId,
    $ai_trace_id: safeId(trace.traceId),
    $ai_session_id: trace.sessionId ? safeId(trace.sessionId) : undefined,
    $ai_span_name: trace.traceName,
    $ai_latency: trace.latencyMs / 1000,
    $ai_is_error: Boolean(trace.isError),
    $ai_error: trace.error || undefined,
    socialsuite_environment: appEnvironment(),
    socialsuite_observability_version: 1,
    ...trace.properties,
  };

  scheduleCapture({
    api_key: token,
    distinct_id: trace.distinctId,
    event: '$ai_trace',
    properties: compact(properties),
    timestamp: new Date().toISOString(),
  });
}

function scheduleCapture(payload: Record<string, unknown>) {
  const request = capture(payload);
  const edgeRuntime = (globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;

  if (typeof edgeRuntime?.waitUntil === 'function') {
    edgeRuntime.waitUntil(request);
    return;
  }

  void request;
}

async function capture(payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2_000);
  try {
    await fetch(captureEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    // Observability must never affect an AI request or response.
  } finally {
    clearTimeout(timeoutId);
  }
}

function sanitizeMessages(messages: ChatMessage[]) {
  let remaining = 60_000;
  return messages.slice(0, 20).map((message) => {
    const content = truncate(sanitizeMessageContent(message.content), Math.max(0, Math.min(remaining, 30_000)));
    remaining -= content.length;
    return { role: message.role, content };
  });
}

function sanitizeMessageContent(content: unknown) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (!part || typeof part !== 'object') return '';
    const record = part as Record<string, unknown>;
    if (record.type === 'text') return stringValue(record.text) || '';
    if (record.type === 'image_url') return '[image]';
    return '';
  }).filter(Boolean).join('\n');
}

function compact(properties: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

function readUsage(value: unknown): OpenRouterUsage {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as OpenRouterUsage
    : {};
}

function safeId(value: unknown) {
  return String(value || '').replace(/[^A-Za-z0-9\-_~.@()!':|]/g, '_').slice(0, 200);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 15))}...[truncated]`;
}
