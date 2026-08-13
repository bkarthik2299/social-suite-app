import { createClient } from 'npm:@supabase/supabase-js@2';
import { inferLogoPlacement, inferVisualSlidePlan } from '../_shared/visual_asset.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type GenerateVisualAssetBody = {
  campaignId?: string;
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

type SelectedLogo = {
  id: string;
  label: string;
  variant: string;
  fileUrl: string;
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

  const campaignId = cleanText(body.campaignId);
  if (campaignId && !isUuid(campaignId)) {
    return jsonResponse({ error: 'A valid campaign is required to generate an image.' }, 400);
  }

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader) {
    return jsonResponse({ error: 'Authentication required.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  let publishableKey: string;
  try {
    publishableKey = getSupabasePublishableKey();
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Supabase is not configured.' }, 500);
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Supabase server credentials are not configured.' }, 500);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse({ error: 'Authentication required.' }, 401);
  }

  let orgId = '';
  if (campaignId) {
    const { data: campaign, error: campaignError } = await userClient
      .from('campaigns')
      .select('id, folders!inner(projects!inner(org_id))')
      .eq('id', campaignId)
      .maybeSingle();
    orgId = readCampaignOrgId(campaign);
    if (campaignError || !orgId) {
      return jsonResponse({ error: 'Campaign not found or access denied.' }, 403);
    }
  } else {
    // Keep older clients working during rollout. The current app sends a
    // campaign ID; older builds use the same first-membership fallback as auth.
    const { data: membership, error: membershipError } = await userClient
      .from('org_members')
      .select('org_id')
      .eq('user_id', authData.user.id)
      .limit(1)
      .maybeSingle();
    orgId = cleanText(membership?.org_id);
    if (membershipError || !orgId) {
      return jsonResponse({ error: 'Workspace not found or access denied.' }, 403);
    }
  }

  const { data: creditAccount, error: creditError } = await userClient
    .from('ai_credit_accounts')
    .select('credits_remaining')
    .eq('org_id', orgId)
    .maybeSingle();
  if (creditError || !creditAccount) {
    return jsonResponse({ error: 'AI credit balance is unavailable.' }, 500);
  }
  if (creditAccount.credits_remaining < 1) {
    return jsonResponse({ error: 'No AI credits remaining. Upgrade or wait for your credits to renew.' }, 402);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const model = cleanText(Deno.env.get('REPLICATE_IMAGE_MODEL')) || 'black-forest-labs/flux-schnell';
  const endpoint = modelEndpoint(model);
  if (!endpoint) {
    return jsonResponse({ error: 'REPLICATE_IMAGE_MODEL must be in owner/model format.' }, 500);
  }

  const context = body.context || {};
  const selectedLogo = await findSelectedLogo(userClient, cleanText(context.selectedLogoId), orgId);
  const slidePlan = inferVisualSlidePlan(visualGuide);

  if (creditAccount.credits_remaining < slidePlan.count) {
    return jsonResponse({
      error: `This ${slidePlan.count}-slide carousel needs ${slidePlan.count} AI credits, but only ${creditAccount.credits_remaining} remain.`,
    }, 402);
  }

  try {
    // Replicate can reduce low-balance accounts to a burst of one prediction and
    // six starts per minute. Stagger starts while allowing renders to overlap, so
    // carousels remain fast without tripping that provider-side burst limit.
    const generated = await mapWithStaggeredStarts(slidePlan.prompts, 11_000, async (slideGuide, index) => {
      const prompt = buildImagePrompt(slideGuide, context, selectedLogo, slidePlan.count > 1 ? index + 1 : undefined, slidePlan.count);
      const input = await buildPredictionInput(model, prompt, context);
      const prediction = await withTransientRetry(async () => {
        const created = await createPrediction(endpoint, token, input);
        return await waitForPrediction(created, token);
      });
      const outputUrl = firstOutputUrl(prediction.output);

      if (!outputUrl) {
        const errorMessage = readError(prediction.error)
          || (cleanText(prediction.status) ? `Replicate finished with status "${cleanText(prediction.status)}" but did not include a supported image URL.` : '')
          || `Slide ${index + 1} did not return an output file.`;
        throw new Error(errorMessage);
      }

      return {
        imageUrl: await imageToDataUrl(outputUrl).catch(() => outputUrl),
        prediction,
      };
    });

    for (const result of generated) {
      const generationKey = cleanText(result.prediction.id)
        ? `replicate:${cleanText(result.prediction.id)}`
        : `request:${crypto.randomUUID()}`;
      const { error: chargeError } = await serviceClient.rpc('charge_ai_image_credit', {
        p_org_id: orgId,
        p_generation_key: generationKey,
      });

      if (chargeError) {
        const insufficientCredits = chargeError.code === 'P0001'
          || /not enough ai credits/i.test(chargeError.message || '');
        return jsonResponse({
          error: insufficientCredits
            ? 'No AI credits remaining. Upgrade or wait for your credits to renew.'
            : 'The image was generated, but its AI credit could not be recorded. Please try again.',
        }, insufficientCredits ? 402 : 500);
      }
    }

    const imageUrls = generated.map((result) => result.imageUrl);
    const logoDataUrl = selectedLogo
      ? await imageToDataUrl(selectedLogo.fileUrl, 1_500_000).catch(() => selectedLogo.fileUrl)
      : undefined;

    return jsonResponse({
      imageUrl: imageUrls[0],
      imageUrls,
      format: slidePlan.isCarousel ? 'carousel' : 'single',
      slideCount: slidePlan.count,
      logoUrl: logoDataUrl,
      predictionIds: generated.map((result) => result.prediction.id).filter(Boolean),
      predictionUrls: generated.map((result) => result.prediction.urls?.web).filter(Boolean),
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Image generation failed.',
    }, 502);
  }
});

async function mapWithStaggeredStarts<T, R>(
  values: T[],
  intervalMs: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  return await Promise.all(values.map(async (value, index) => {
    if (index > 0) await delay(index * intervalMs);
    return await worker(value, index);
  }));
}

async function withTransientRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const transient = /\b(408|409|425|429|500|502|503|504)\b|rate|throttl|concurr|temporar|timeout|timed out|network|fetch/i.test(message);
      if (!transient || attempt === 2) throw error;
      const throttled = /\b429\b|rate|throttl|burst/i.test(message);
      await delay(throttled ? 11_000 : 1200 * (2 ** attempt));
    }
  }

  throw lastError;
}

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

async function buildPredictionInput(model: string, prompt: string, context: Record<string, unknown>): Promise<Record<string, unknown>> {
  const input: Record<string, unknown> = { prompt };
  const aspectRatio = normalizeAspectRatio(context.aspectRatio);
  const modelId = model.toLowerCase();

  if (modelId === 'openai/gpt-image-2') {
    input.quality = 'medium';
    input.output_format = 'jpeg';
    input.aspect_ratio = normalizeGptImage2AspectRatio(aspectRatio);
  } else if (modelId.includes('flux')) {
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

async function imageToDataUrl(url: string, maxBytes = 4_000_000): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Generated image could not be fetched.');

  const contentType = response.headers.get('content-type') || 'image/webp';
  const buffer = await response.arrayBuffer();

  if (!contentType.startsWith('image/') || buffer.byteLength > maxBytes) {
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
      || firstOutputUrl(record.urls)
      || firstOutputUrl(record.image)
      || firstOutputUrl(record.images)
      || firstOutputUrl(record.file)
      || firstOutputUrl(record.files)
      || firstOutputUrl(record.download_url)
      || firstOutputUrl(record.downloadUrl)
      || firstOutputUrl(record.signed_url)
      || firstOutputUrl(record.signedUrl)
      || firstOutputUrl(record.uri)
      || firstOutputUrl(record.href)
      || firstOutputUrl(record.data)
      || firstOutputUrl(record.result)
      || firstOutputUrl(record.output);
  }

  return undefined;
}

function buildImagePrompt(
  visualGuide: string,
  context: Record<string, unknown>,
  selectedLogo: SelectedLogo | null,
  slideNumber?: number,
  slideCount = 1,
) {
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
  const logoPlacement = selectedLogo ? inferLogoPlacement(visualGuide) : '';

  return [
    slideCount > 1
      ? `Create slide ${slideNumber || 1} of ${slideCount} as one polished, brand-safe marketing image.`
      : 'Create one polished, brand-safe marketing image for a campaign draft.',
    kind ? `Asset type: ${kind}.` : '',
    platform || platforms ? `Platform context: ${platform || platforms}.` : '',
    aspectRatio ? `Required aspect ratio: ${aspectRatio}.` : '',
    topic ? `Topic: ${topic}.` : '',
    headline ? `Headline context: ${headline}.` : '',
    name ? `Draft name: ${name}.` : '',
    brandGuideContext ? `Brand guide design context:\n${brandGuideContext}` : '',
    selectedLogo
      ? `Logo-safe composition: reserve a calm, uncluttered ${logoPlacement} safe area for the exact "${selectedLogo.label}" (${selectedLogo.variant}) logo. Do not draw, imitate, spell, distort, or invent the logo; the real logo asset will be composited there after generation.`
      : '',
    `Visual guide: ${visualGuide}`,
    'Style requirements: clean professional composition, clear focal point, premium commercial quality, realistic lighting, no crowded layout, no dense readable text, do not render or invent any logo/wordmark, no graphic medical procedure imagery, no before-and-after claims, no misleading health outcome claims.',
  ].filter(Boolean).join('\n');
}

async function findSelectedLogo(
  userClient: ReturnType<typeof createClient>,
  logoId: string,
  orgId: string,
): Promise<SelectedLogo | null> {
  if (!logoId || !isUuid(logoId)) return null;

  const { data, error } = await userClient
    .from('brand_logos')
    .select('id, label, variant, file_url, brand_guides!inner(org_id)')
    .eq('id', logoId)
    .eq('brand_guides.org_id', orgId)
    .maybeSingle();
  if (error || !data) return null;

  const record = data as Record<string, unknown>;
  const fileUrl = cleanText(record.file_url);
  if (!fileUrl || !/^https?:\/\//i.test(fileUrl) && !/^data:image\//i.test(fileUrl)) return null;

  return {
    id: cleanText(record.id),
    label: cleanText(record.label) || 'Brand logo',
    variant: cleanText(record.variant) || 'approved',
    fileUrl,
  };
}

function normalizeAspectRatio(value: unknown) {
  const ratio = cleanText(value);
  return ['1:1', '4:5', '9:16', '16:9'].includes(ratio) ? ratio : '1:1';
}

function normalizeGptImage2AspectRatio(value: string) {
  if (value === '16:9') return '3:2';
  if (value === '4:5' || value === '9:16') return '2:3';
  return '1:1';
}

function cleanBrandGuideSummary(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  return cleanText(record.summary).slice(0, 1600);
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getSupabasePublishableKey() {
  const legacyAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacyAnonKey) return legacyAnonKey;

  const publishableKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (publishableKeys) {
    const parsed = JSON.parse(publishableKeys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }

  throw new Error('Supabase publishable key is not configured.');
}

function readCampaignOrgId(campaign: unknown) {
  if (!campaign || typeof campaign !== 'object') return '';
  const folderValue = (campaign as Record<string, unknown>).folders;
  const folder = Array.isArray(folderValue) ? folderValue[0] : folderValue;
  if (!folder || typeof folder !== 'object') return '';
  const projectValue = (folder as Record<string, unknown>).projects;
  const project = Array.isArray(projectValue) ? projectValue[0] : projectValue;
  if (!project || typeof project !== 'object') return '';
  return cleanText((project as Record<string, unknown>).org_id);
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

function previewValue(value: unknown) {
  try {
    return JSON.stringify(value).slice(0, 800);
  } catch {
    return '';
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
