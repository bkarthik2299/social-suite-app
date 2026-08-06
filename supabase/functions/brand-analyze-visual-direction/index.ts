import { createClient } from 'npm:@supabase/supabase-js@2';

type RequestBody = {
  guideId: string;
};

type VisualDirectionAnalysis = {
  fields?: {
    photography_style?: string;
    illustration_style?: string;
    iconography_rules?: string;
    layout_composition?: string;
  };
  pattern_notes?: {
    consistent_patterns?: string[];
    recurring_patterns?: string[];
    one_off_treatments?: string[];
  };
};

type ChatMessageContent =
  | string
  | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;

type OpenRouterResponse = {
  error?: string | { message?: string };
  choices?: Array<{ message?: { content?: string } }>;
};

const model = 'google/gemini-3-flash-preview';
const maxImages = 15;
const minImages = 3;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const getRequiredSecret = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

const getSupabasePublishableKey = () => {
  const legacyAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacyAnonKey) return legacyAnonKey;

  const publishableKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (publishableKeys) {
    try {
      const parsed = JSON.parse(publishableKeys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      throw new Error('SUPABASE_PUBLISHABLE_KEYS is not valid JSON');
    }
  }

  throw new Error('Supabase publishable key is not configured');
};

const getUserClient = (req: Request) => createClient(
  Deno.env.get('SUPABASE_URL')!,
  getSupabasePublishableKey(),
  {
    global: {
      headers: { Authorization: req.headers.get('Authorization') || '' },
    },
  },
);

const cleanText = (value: unknown, maxLength = 900) =>
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';

const cleanList = (value: unknown, maxItems = 8, maxLength = 180) =>
  Array.isArray(value)
    ? value.map((item) => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : [];

const cleanAnalysis = (analysis: VisualDirectionAnalysis): Required<VisualDirectionAnalysis> => ({
  fields: {
    photography_style: cleanText(analysis?.fields?.photography_style, 900),
    illustration_style: cleanText(analysis?.fields?.illustration_style, 900),
    iconography_rules: cleanText(analysis?.fields?.iconography_rules, 900),
    layout_composition: cleanText(analysis?.fields?.layout_composition, 1100),
  },
  pattern_notes: {
    consistent_patterns: cleanList(analysis?.pattern_notes?.consistent_patterns),
    recurring_patterns: cleanList(analysis?.pattern_notes?.recurring_patterns),
    one_off_treatments: cleanList(analysis?.pattern_notes?.one_off_treatments),
  },
});

async function openRouterJson<T>(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: ChatMessageContent }>): Promise<T> {
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
      temperature: 0.2,
      max_tokens: 1600,
      response_format: { type: 'json_object' },
      plugins: [{ id: 'response-healing' }],
      provider: { require_parameters: true, sort: 'throughput' },
    }),
  });
  const data = await response.json().catch(() => ({})) as OpenRouterResponse;
  if (!response.ok) {
    const detail = typeof data.error === 'string'
      ? data.error
      : data.error?.message || JSON.stringify(data).slice(0, 500);
    throw new Error(`OpenRouter request failed: ${response.status} ${detail}`.trim());
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned an empty response');
  return parseJsonContent<T>(content);
}

function parseJsonContent<T>(content: string): T {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const candidate = (fenced || trimmed)
    .replace(/^\uFEFF/, '')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const objectStart = candidate.indexOf('{');
    const objectEnd = candidate.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(candidate.slice(objectStart, objectEnd + 1)) as T;
    }
    throw new Error('OpenRouter returned invalid JSON');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: `Method ${req.method} not allowed` }, 405);

  try {
    getRequiredSecret('OPENROUTER_API_KEY');
    const supabase = getUserClient(req);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw new Error('Authentication required');

    const { guideId } = await req.json() as RequestBody;
    if (!guideId) return jsonResponse({ error: 'guideId is required' }, 400);

    const { data: guide, error: guideError } = await supabase
      .from('brand_guides')
      .select('id,org_id,brand_name')
      .eq('id', guideId)
      .maybeSingle();
    if (guideError) throw guideError;
    if (!guide) return jsonResponse({ error: 'Brand guide was not found.' }, 404);

    const { data: images, error: imageError } = await supabase
      .from('brand_mood_images')
      .select('id,image_url,caption,sort_order,created_at')
      .eq('guide_id', guideId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (imageError) throw imageError;

    const moodImages = (images || [])
      .map((image) => ({
        id: String(image.id || ''),
        image_url: String(image.image_url || '').trim(),
        caption: cleanText(image.caption, 220),
      }))
      .filter((image) => image.image_url)
      .slice(0, maxImages);

    if (moodImages.length < minImages) {
      return jsonResponse({ error: `Upload at least ${minImages} moodboard images before analysing visual direction.` }, 400);
    }

    const analysis = await openRouterJson<VisualDirectionAnalysis>([
      {
        role: 'system',
        content: [
          'You analyse a brand moodboard for a social media agency.',
          'Return only valid JSON.',
          'Study all uploaded images together as one moodboard and identify visual patterns across posts.',
          'Only describe patterns supported by the uploaded images.',
          'Do not invent a style when there are not enough examples.',
          'Separate consistent patterns seen across most posts, recurring patterns seen across several posts, and one-off campaign treatments.',
          'Prioritise consistent and recurring patterns in the final field descriptions.',
          'Avoid presenting one-off campaign treatments as brand rules.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              task: 'Analyse this moodboard and return short editable visual direction descriptions.',
              brandName: guide.brand_name || 'Selected brand',
              requiredJsonShape: {
                fields: {
                  photography_style: '50-80 words. Describe subjects, posing, photography treatment, lighting, composition and colour treatment. If insufficient photo evidence, say so plainly.',
                  illustration_style: '50-80 words. Describe illustration type, realism, line treatment, shapes, textures, depth, lighting, colours and mood. If insufficient illustration evidence, say so plainly.',
                  iconography_rules: '50-80 words. Describe outline/filled icons, stroke thickness, rounded/sharp appearance, colour usage, detail and decorative style. If insufficient icon evidence, say so plainly.',
                  layout_composition: '50-100 words. Describe logo placement, hashtag placement, hierarchy, typography, alignment, subject positioning, footer bars, CTAs, contact information, colour blocks, overlays, frames, gradients and repeated layout patterns.',
                },
                pattern_notes: {
                  consistent_patterns: ['short strings'],
                  recurring_patterns: ['short strings'],
                  one_off_treatments: ['short strings'],
                },
              },
              imageCaptions: moodImages.map((image, index) => ({
                image: index + 1,
                caption: image.caption,
              })),
              fallbackSentence: 'Not enough icon references were found to confidently define an icon style.',
            }),
          },
          ...moodImages.map((image) => ({
            type: 'image_url' as const,
            image_url: { url: image.image_url },
          })),
        ],
      },
    ]);

    return jsonResponse({
      analysis: cleanAnalysis(analysis),
      imageCount: moodImages.length,
      model,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
