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

const summarizeAssetReference = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const source = value.trim();
  if (/^data:/i.test(source)) {
    const mimeType = source.match(/^data:([^;,]+)/i)?.[1] || 'uploaded asset';
    return `[${mimeType} upload omitted from text prompt; ${source.length} data-url characters]`;
  }
  return source.length > 500 ? `${source.slice(0, 500)}...` : source;
};

const summarizeLogo = (logo: Record<string, unknown>) => ({
  id: logo.id,
  label: logo.label,
  variant: logo.variant,
  format: logo.format,
  dimensions: logo.dimensions,
  sort_order: logo.sort_order,
  file_url: summarizeAssetReference(logo.file_url),
});

const summarizeMoodImage = (image: Record<string, unknown>) => ({
  id: image.id,
  caption: image.caption,
  sort_order: image.sort_order,
  image_url: summarizeAssetReference(image.image_url),
});

const valueList = (values: unknown[]) => values
  .map((value) => String(value || '').trim())
  .filter(Boolean);

const bulletList = (values: unknown[], fallback = '- Not specified') => {
  const items = valueList(values);
  return items.length ? items.map((item) => `- ${item}`).join('\n') : fallback;
};

const textValue = (value: unknown, fallback = 'Not specified') => {
  const text = String(value || '').trim();
  return text || fallback;
};

const fallbackKnowledgeMarkdown = (sourcePackage: {
  guide: Record<string, unknown>;
  colors: Array<Record<string, unknown>>;
  fonts: Array<Record<string, unknown>>;
  logos: Array<Record<string, unknown>>;
  logoRules: Array<Record<string, unknown>>;
  moodImages: Array<Record<string, unknown>>;
  socialLinks: Array<{ platform: string; url: string }>;
}) => {
  const guide = sourcePackage.guide;
  const customSections = Array.isArray(guide.custom_sections)
    ? guide.custom_sections.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    : [];
  const contentPillars = customSections
    .filter((section) => section.type === 'content_pillar')
    .map((section) => `${textValue(section.title, 'Untitled pillar')}: ${textValue(section.description, '')}`);
  const socialLinks = sourcePackage.socialLinks.map((link) => `${link.platform}: ${link.url}`);
  const colors = sourcePackage.colors.map((color) => {
    const name = textValue(color.name, 'Color');
    const hex = textValue(color.hex, '');
    const usage = textValue(color.usage, '');
    return [name, hex, usage].filter(Boolean).join(' - ');
  });
  const fonts = sourcePackage.fonts.map((font) => {
    const role = textValue(font.role, 'Font');
    const family = textValue(font.family, '');
    const usage = textValue(font.usage, '');
    return [role, family, usage].filter(Boolean).join(' - ');
  });
  const logos = sourcePackage.logos.map((logo) => {
    const label = textValue(logo.label, 'Logo');
    const variant = textValue(logo.variant, '');
    const format = textValue(logo.format, '');
    return [label, variant, format].filter(Boolean).join(' - ');
  });
  const logoRules = sourcePackage.logoRules.map((rule) => textValue(rule.rule || rule.description || rule.title, 'Logo rule'));
  const moodImages = sourcePackage.moodImages.map((image) => textValue(image.caption || image.image_url, 'Uploaded visual reference'));
  const visualNotes = [
    `Photography style: ${textValue(guide.photography_style)}`,
    `Illustration style: ${textValue(guide.illustration_style)}`,
    `Iconography rules: ${textValue(guide.iconography_rules)}`,
    `Layout and composition: ${textValue(guide.layout_composition)}`,
  ];

  return `# ${textValue(guide.brand_name, 'Brand')} Knowledge

## Identity
- Brand name: ${textValue(guide.brand_name)}
- Website: ${textValue(guide.website_url)}
- About: ${textValue(guide.description || guide.about)}
- Positioning: ${textValue(guide.positioning)}
- Audience: ${textValue(guide.audience)}

## Voice And Tone
- Voice: ${textValue(guide.voice)}
- Tone: ${textValue(guide.tone)}
- Writing rules: ${textValue(guide.text_rules)}
- Use this when writing: Keep content consistent with the saved brand identity, audience, tone, colors, typography, logo rules, and visual references. Do not invent unsupported claims.

## Content Pillars
${bulletList(contentPillars)}

## Social And Platform Cues
${bulletList(socialLinks)}

## Colors
${bulletList(colors)}

## Typography
${bulletList(fonts)}

## Logo Usage
${bulletList(logos)}

## Logo Rules
${bulletList(logoRules)}

## Visual Direction
${bulletList(visualNotes)}

## Visual References
${bulletList(moodImages)}

## Proof Points
- Use only claims present in the saved brand guide, linked profiles, or researched website content.

## Unknowns
- Verify missing audience details, proof points, offers, and platform-specific claims before publishing.
`;
};

const instantModel = () =>
  'deepseek/deepseek-v4-flash';

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
      logos: (logos.data || []).map((logo) => summarizeLogo(logo as Record<string, unknown>)),
      logoRules: logoRules.data || [],
      moodImages: (moodImages.data || []).map((image) => summarizeMoodImage(image as Record<string, unknown>)),
      socialLinks,
      externalSnippets,
    };
    const sourceHash = await sha256(JSON.stringify(sourcePackage));
    const model = instantModel();

    let markdown: string;
    let generationError: string | null = null;
    try {
      markdown = await openRouterText({
        model,
        maxTokens: 2600,
        timeoutMs: 25_000,
        observability: {
          distinctId: userId,
          traceId: `brand-knowledge:${guideId}`,
          sessionId: guideId,
          spanName: 'brand-knowledge-compile',
          feature: 'brand-knowledge',
          properties: {
            socialsuite_org_id: guide.org_id,
            socialsuite_brand_guide_id: guideId,
          },
        },
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
    } catch (error) {
      generationError = error instanceof Error ? error.message : 'OpenRouter generation failed';
      markdown = fallbackKnowledgeMarkdown(sourcePackage);
    }

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
        model: generationError ? `${model}+deterministic-fallback` : model,
        manual_edit: false,
        error: generationError,
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
