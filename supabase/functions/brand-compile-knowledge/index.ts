import { currentUserId, getRequiredSecret, getUserClient, jsonResponse, readJson, requireMethod } from '../_shared/http.ts';
import { openRouterText } from '../_shared/openrouter.ts';

type RequestBody = {
  guideId: string;
  refresh?: boolean;
};

const sha256 = async (text: string) => {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

const fetchTavily = async (url: string) => {
  const apiKey = Deno.env.get('TAVILY_API_KEY');
  if (!apiKey || !url) return null;

  const response = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: [url], extract_depth: 'basic' }),
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data?.results?.[0]?.raw_content || data?.results?.[0]?.content || null;
};

const fetchSupadata = async (url: string) => {
  const apiKey = Deno.env.get('SUPADATA_API_KEY');
  if (!apiKey || !url) return null;

  const response = await fetch(`https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(url)}`, {
    headers: { 'x-api-key': apiKey },
  });

  if (!response.ok) return null;
  const data = await response.json();
  const text = Array.isArray(data?.content)
    ? data.content.map((item: { text?: string }) => item.text).filter(Boolean).join('\n')
    : data?.text || data?.transcript;
  return text || null;
};

const socialLinksFromCustomSections = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as Record<string, unknown>)
    .filter((item) => item.type === 'social_link' && typeof item.url === 'string')
    .map((item) => ({ platform: String(item.platform || 'social'), url: String(item.url) }));
};

const instantModel = () =>
  Deno.env.get('OPENROUTER_INSTANT_MODEL') ||
  Deno.env.get('AI_INSTANT_MODEL') ||
  Deno.env.get('AI_FAST_MODEL') ||
  Deno.env.get('AI_DEFAULT_MODEL') ||
  'qwen/qwen3-coder-30b-a3b-instruct';

Deno.serve(async (req) => {
  const methodResponse = requireMethod(req);
  if (methodResponse) return methodResponse;

  try {
    getRequiredSecret('OPENROUTER_API_KEY');
    const supabase = getUserClient(req);
    const userId = await currentUserId(supabase);
    const { guideId } = await readJson<RequestBody>(req);
    if (!guideId) return jsonResponse({ error: 'guideId is required' }, 400);

    const { data: guide, error: guideError } = await supabase
      .from('brand_guides')
      .select('*')
      .eq('id', guideId)
      .maybeSingle();
    if (guideError) throw guideError;
    if (!guide) return jsonResponse({ error: 'Brand guide was not found in Supabase. Save or recreate it before compiling Brand Knowledge.' }, 404);

    const [colors, fonts, logos, logoRules, moodImages] = await Promise.all([
      supabase.from('brand_colors').select('*').eq('guide_id', guideId).order('sort_order'),
      supabase.from('brand_fonts').select('*').eq('guide_id', guideId).order('sort_order'),
      supabase.from('brand_logos').select('*').eq('guide_id', guideId).order('sort_order'),
      supabase.from('brand_logo_rules').select('*').eq('guide_id', guideId).order('sort_order'),
      supabase.from('brand_mood_images').select('*').eq('guide_id', guideId).order('sort_order'),
    ]);

    const socialLinks = socialLinksFromCustomSections(guide.custom_sections);
    const externalSnippets: Array<{ label: string; url: string; text: string }> = [];

    for (const link of socialLinks.slice(0, 5)) {
      const extracted = await fetchSupadata(link.url) || await fetchTavily(link.url);
      if (extracted) externalSnippets.push({ label: link.platform, url: link.url, text: extracted.slice(0, 5000) });
    }

    const sourcePackage = {
      guide,
      colors: colors.data || [],
      fonts: fonts.data || [],
      logos: logos.data || [],
      logoRules: logoRules.data || [],
      moodImages: moodImages.data || [],
      socialLinks,
      externalSnippets,
    };
    const sourceHash = await sha256(JSON.stringify(sourcePackage));
    const model = instantModel();

    const markdown = await openRouterText({
      model,
      messages: [
        {
          role: 'system',
          content: 'You compile complete brand guides for a social media agency. Return only polished markdown. Be concise but specific. Do not invent facts.',
        },
        {
          role: 'user',
          content: `Create one canonical Brand Knowledge markdown document from this structured data. Include identity, audience, voice, writing rules, platform/social cues, visual rules, colors, typography, logo usage, content pillars, proof points, unknowns, and "use this when writing" guidance.\n\n${JSON.stringify(sourcePackage)}`,
        },
      ],
    });

    const summary = markdown.split('\n').filter(Boolean).slice(0, 5).join(' ').slice(0, 500);

    const { data: doc, error: upsertError } = await supabase
      .from('brand_knowledge_documents')
      .upsert({
        org_id: guide.org_id,
        guide_id: guideId,
        title: `${guide.brand_name || 'Brand'} Knowledge`,
        markdown,
        summary,
        source_hash: sourceHash,
        status: 'ready',
        model,
        manual_edit: false,
        error: null,
        generated_by: userId,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'guide_id' })
      .select()
      .single();
    if (upsertError) throw upsertError;

    return jsonResponse({ document: doc });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
