const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type GenerateVisualAssetBody = {
  visualGuide?: string;
  context?: Record<string, unknown>;
};

type Prediction = {
  id?: string;
  status?: string;
  output?: unknown;
  error?: unknown;
  urls?: {
    get?: string;
    web?: string;
  };
};

const jsonResponse = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json',
    'Connection': 'keep-alive',
  },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const token = Deno.env.get('REPLICATE_API_TOKEN') || Deno.env.get('REPLICATE_API_KEY');
  if (!token) {
    return jsonResponse({ error: 'REPLICATE_API_TOKEN is not configured in Supabase Edge Function secrets.' }, 500);
  }

  let body: GenerateVisualAssetBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const visualGuide = cleanText(body.visualGuide).slice(0, 1400);
  if (visualGuide.length < 12) {
    return jsonResponse({ error: 'Visual Guide must be at least 12 characters.' }, 400);
  }

  const model = cleanText(Deno.env.get('REPLICATE_IMAGE_MODEL')) || 'black-forest-labs/flux-schnell';
  const endpoint = modelEndpoint(model);
  if (!endpoint) {
    return jsonResponse({ error: 'REPLICATE_IMAGE_MODEL must be in owner/model format.' }, 500);
  }

  const context = body.context || {};
  const prompt = buildImagePrompt(visualGuide, context);
  const input = buildPredictionInput(model, prompt, context);

  try {
    const created = await createPrediction(endpoint, token, input);
    const prediction = await waitForPrediction(created, token);
    const outputUrl = firstOutputUrl(prediction.output);

    if (!outputUrl) {
      const errorMessage = typeof prediction.error === 'string'
        ? prediction.error
        : 'Image generation did not return an output file.';
      return jsonResponse({ error: errorMessage, predictionId: prediction.id, predictionUrl: prediction.urls?.web }, 502);
    }

    const imageUrl = await imageToDataUrl(outputUrl).catch(() => outputUrl);

    return jsonResponse({
      imageUrl,
      temporaryUrl: imageUrl === outputUrl,
      predictionId: prediction.id,
      predictionUrl: prediction.urls?.web,
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Image generation failed.',
    }, 502);
  }
});

async function createPrediction(endpoint: string, token: string, input: Record<string, unknown>): Promise<Prediction> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait=45',
      'Cancel-After': '2m',
    },
    body: JSON.stringify({
      input,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readError(payload) || `Replicate request failed with status ${response.status}.`);
  }

  return payload as Prediction;
}

function buildPredictionInput(model: string, prompt: string, context: Record<string, unknown>): Record<string, unknown> {
  const input: Record<string, unknown> = { prompt };
  const aspectRatio = normalizeAspectRatio(context.aspectRatio);

  if (model.toLowerCase() === 'openai/gpt-image-2') {
    input.quality = 'medium';
    input.output_format = 'jpeg';
    input.aspect_ratio = aspectRatio;

    const inputImages = shouldUseBrandReferenceImages() ? brandGuideImageUrls(context).slice(0, 4) : [];
    if (inputImages.length) {
      input.input_images = inputImages;
    }
  } else if (model.toLowerCase().includes('flux')) {
    input.aspect_ratio = aspectRatio;
  }

  return input;
}

async function waitForPrediction(prediction: Prediction, token: string): Promise<Prediction> {
  let current = prediction;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (firstOutputUrl(current.output)) return current;

    const status = cleanText(current.status).toLowerCase();
    if (['succeeded', 'successful', 'failed', 'canceled', 'cancelled'].includes(status)) {
      return current;
    }

    const getUrl = current.urls?.get;
    if (!getUrl) return current;

    await delay(1500);
    const response = await fetch(getUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(readError(payload) || `Replicate polling failed with status ${response.status}.`);
    }
    current = payload as Prediction;
  }

  return current;
}

async function imageToDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Generated image could not be fetched.');

  const contentType = response.headers.get('content-type') || 'image/webp';
  const buffer = await response.arrayBuffer();

  if (!contentType.startsWith('image/') || buffer.byteLength > 4_000_000) {
    throw new Error('Generated image is too large to inline.');
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return `data:${contentType};base64,${btoa(binary)}`;
}

function firstOutputUrl(output: unknown): string | undefined {
  if (typeof output === 'string' && output.startsWith('http')) return output;

  if (Array.isArray(output)) {
    for (const item of output) {
      const url = firstOutputUrl(item);
      if (url) return url;
    }
  }

  if (output && typeof output === 'object') {
    const record = output as Record<string, unknown>;
    return firstOutputUrl(record.url)
      || firstOutputUrl(record.image)
      || firstOutputUrl(record.file)
      || firstOutputUrl(record.output);
  }

  return undefined;
}

function buildImagePrompt(visualGuide: string, context: Record<string, unknown>) {
  const kind = cleanText(context.kind);
  const platform = cleanText(context.platform);
  const platforms = Array.isArray(context.platforms)
    ? context.platforms.map(cleanText).filter(Boolean).join(', ')
    : '';
  const topic = cleanText(context.topic);
  const headline = cleanText(context.headline);
  const name = cleanText(context.name);
  const aspectRatio = normalizeAspectRatio(context.aspectRatio);
  const brandGuideContext = context.useBrandGuide === true ? cleanBrandGuideSummary(context.brandGuide) : '';

  return [
    'Create one polished, brand-safe marketing image for a campaign draft.',
    kind ? `Asset type: ${kind}.` : '',
    platform || platforms ? `Platform context: ${platform || platforms}.` : '',
    aspectRatio ? `Required aspect ratio: ${aspectRatio}.` : '',
    topic ? `Topic: ${topic}.` : '',
    headline ? `Headline context: ${headline}.` : '',
    name ? `Draft name: ${name}.` : '',
    brandGuideContext ? `Brand guide design context:\n${brandGuideContext}` : '',
    `Visual guide: ${visualGuide}`,
    'Style requirements: clean professional composition, clear focal point, premium commercial quality, realistic lighting, no crowded layout, no dense readable text, no brand logo unless explicitly provided, no graphic medical procedure imagery, no before-and-after claims, no misleading health outcome claims.',
  ].filter(Boolean).join('\n');
}

function normalizeAspectRatio(value: unknown) {
  const ratio = cleanText(value);
  return ['1:1', '4:5', '9:16', '16:9'].includes(ratio) ? ratio : '1:1';
}

function cleanBrandGuideSummary(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  return cleanText(record.summary).slice(0, 1600);
}

function brandGuideImageUrls(context: Record<string, unknown>) {
  if (context.useBrandGuide !== true) return [];
  const brandGuide = context.brandGuide;
  if (!brandGuide || typeof brandGuide !== 'object') return [];
  const imageUrls = (brandGuide as Record<string, unknown>).imageUrls;
  return Array.isArray(imageUrls)
    ? imageUrls.filter((url): url is string => typeof url === 'string' && /^https?:\/\//i.test(url)).slice(0, 6)
    : [];
}

function shouldUseBrandReferenceImages() {
  return cleanText(Deno.env.get('REPLICATE_USE_BRAND_REFERENCE_IMAGES')).toLowerCase() === 'true';
}

function modelEndpoint(model: string) {
  const parts = model.split('/').map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) return undefined;
  const [owner, name] = parts;
  return `https://api.replicate.com/v1/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/predictions`;
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function readError(payload: unknown) {
  if (typeof payload === 'string') return payload;
  if (Array.isArray(payload)) return payload.map(readError).filter(Boolean).join(' ');
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  return cleanText(record.detail)
    || cleanText(record.error)
    || cleanText(record.message)
    || readError(record.detail)
    || readError(record.error)
    || readError(record.message)
    || JSON.stringify(payload).slice(0, 500);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
