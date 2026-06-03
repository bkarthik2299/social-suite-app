import { currentUserId, getRequiredSecret, getUserClient, jsonResponse, readJson, requireMethod } from '../_shared/http.ts';
import { openRouterJson } from '../_shared/openrouter.ts';

type RequestBody = {
  guideId: string;
  brandName?: string;
  websiteUrl?: string;
};

type ScrapedPage = {
  url: string;
  title: string;
  description: string;
  markdown: string;
  links: string[];
  html: string;
  branding?: Record<string, unknown> | null;
};

type ExtractedColor = {
  name?: string;
  role?: 'primary' | 'secondary' | 'accent' | 'neutral' | 'background';
  hex?: string;
};

type ExtractedFont = {
  family?: string;
  category?: 'heading' | 'body' | 'accent' | 'code';
  source_url?: string;
};

type ExtractedLogo = {
  label?: string;
  file_url?: string;
  variant?: 'primary' | 'secondary' | 'icon' | 'monochrome' | 'reversed';
};

type SocialLink = {
  type: 'social_link';
  platform: string;
  url: string;
};

type ColorCandidate = {
  hex: string;
  score: number;
  role?: ExtractedColor['role'];
  label?: string;
};

type ResearchExtraction = {
  brand_name?: string;
  tagline?: string;
  industry?: string;
  target_audience?: string;
  elevator_pitch?: string;
  mission?: string;
  vision?: string;
  brand_values?: string[];
  personality?: string[];
  writing_dos?: string[];
  writing_donts?: string[];
  preferred_terms?: string[];
  avoided_terms?: string[];
  sample_copy?: string[];
  content_pillars?: string[];
  photography_style?: string;
  illustration_style?: string;
  iconography_rules?: string;
  social_rules?: string;
  ad_rules?: string;
  research_summary?: string;
  proof_points?: string[];
  unknowns?: string[];
  colors?: ExtractedColor[];
  fonts?: ExtractedFont[];
  logos?: ExtractedLogo[];
};

const maxPages = () => {
  const parsed = Number.parseInt(Deno.env.get('FIRECRAWL_MAX_PAGES') || '5', 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 8) : 5;
};

const instantModel = () =>
  Deno.env.get('OPENROUTER_INSTANT_MODEL') ||
  Deno.env.get('AI_INSTANT_MODEL') ||
  Deno.env.get('AI_FAST_MODEL') ||
  Deno.env.get('AI_DEFAULT_MODEL') ||
  'qwen/qwen3-coder-30b-a3b-instruct';

const normalizeWebsiteUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Website URL is required');
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error('Website URL is invalid');
  }
};

const cleanText = (value: unknown, maxLength = 1600) => {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, maxLength) : null;
};

const cleanArray = (value: unknown, maxItems = 12, maxLength = 180) => {
  if (!Array.isArray(value)) return null;
  const clean = value
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean) as string[];
  return clean.length ? Array.from(new Set(clean)).slice(0, maxItems) : null;
};

const normalizeHex = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const hex = value.trim().toUpperCase();
  const full = /^#[0-9A-F]{6}$/.test(hex) ? hex : null;
  if (full) return full;
  if (/^#[0-9A-F]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return null;
};

const isGrayish = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  return Math.max(r, g, b) - Math.min(r, g, b) < 14;
};

const isVeryLight = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  return (r + g + b) / 3 > 235;
};

const isBrowserDefaultColor = (hex: string) => {
  return new Set(['#0000EE', '#0000FF', '#551A8B', '#EE0000', '#FF0000', '#00FF00']).has(hex);
};

const hexToRgb = (hex: string) => {
  const clean = hex.replace('#', '');
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
};

const rgbDistance = (left: string, right: string) => {
  const a = hexToRgb(left);
  const b = hexToRgb(right);
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
};

const formatFromUrl = (url: string) => {
  const clean = url.split('?')[0]?.toLowerCase() || '';
  if (clean.endsWith('.svg')) return 'svg';
  if (clean.endsWith('.png')) return 'png';
  if (clean.endsWith('.webp')) return 'webp';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'jpg';
  return null;
};

const colorRole = (value: unknown, fallback: ExtractedColor['role']) => {
  return ['primary', 'secondary', 'accent', 'neutral', 'background'].includes(String(value))
    ? value as ExtractedColor['role']
    : fallback;
};

const fontCategory = (value: unknown, fallback: ExtractedFont['category']) => {
  return ['heading', 'body', 'accent', 'code'].includes(String(value))
    ? value as ExtractedFont['category']
    : fallback;
};

const logoVariant = (value: unknown, fallback: ExtractedLogo['variant']) => {
  return ['primary', 'secondary', 'icon', 'monochrome', 'reversed'].includes(String(value))
    ? value as ExtractedLogo['variant']
    : fallback;
};

const endpoint = (path: string) => `https://api.firecrawl.dev/v2/${path}`;

async function firecrawlPost<T>(path: string, body: Record<string, unknown>) {
  const response = await fetch(endpoint(path), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getRequiredSecret('FIRECRAWL_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Website research failed: ${response.status} ${text.slice(0, 300)}`);
  }
  return JSON.parse(text || '{}') as T;
}

async function mapWebsite(url: string) {
  try {
    const data = await firecrawlPost<{ success?: boolean; links?: Array<string | { url?: string; title?: string; description?: string }> }>('map', {
      url,
      sitemap: 'include',
      includeSubdomains: false,
      ignoreQueryParameters: true,
      limit: 24,
      timeout: 60000,
    });
    return (data.links || [])
      .map((link) => typeof link === 'string' ? { url: link, title: '', description: '' } : {
        url: String(link.url || ''),
        title: String(link.title || ''),
        description: String(link.description || ''),
      })
      .filter((link) => link.url);
  } catch {
    return [];
  }
}

const pageScore = (url: string, title = '', description = '') => {
  const haystack = `${url} ${title} ${description}`.toLowerCase();
  const weights: Array<[string, number]> = [
    ['about', 12],
    ['company', 10],
    ['product', 10],
    ['platform', 10],
    ['solution', 9],
    ['service', 8],
    ['feature', 8],
    ['customer', 7],
    ['case', 7],
    ['pricing', 5],
    ['contact', 4],
    ['blog', 2],
    ['privacy', -12],
    ['terms', -12],
    ['login', -12],
    ['career', -8],
  ];
  return weights.reduce((score, [term, weight]) => score + (haystack.includes(term) ? weight : 0), 0);
};

async function scrapePage(url: string): Promise<ScrapedPage | null> {
  try {
    const data = await firecrawlPost<{
      success?: boolean;
      data?: {
        markdown?: string;
        summary?: string;
        html?: string;
        rawHtml?: string;
        links?: string[];
        metadata?: Record<string, unknown>;
        branding?: Record<string, unknown>;
      };
    }>('scrape', {
      url,
      formats: ['markdown', 'links', 'branding', 'html', 'rawHtml'],
      onlyMainContent: false,
      onlyCleanContent: false,
      removeBase64Images: true,
      blockAds: true,
      timeout: 60000,
    });
    const page = data.data || {};
    const metadata = page.metadata || {};
    const markdown = cleanText(page.markdown || page.summary, 7000);
    if (!markdown) return null;
    return {
      url,
      title: cleanText(metadata.title, 240) || '',
      description: cleanText(metadata.description, 420) || '',
      markdown,
      links: Array.isArray(page.links) ? page.links.filter((link): link is string => typeof link === 'string') : [],
      html: cleanText(page.rawHtml || page.html, 250000) || '',
      branding: page.branding || null,
    };
  } catch {
    return null;
  }
}

const platformFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (host === 'instagram.com' && path !== '/') return 'instagram';
    if (host === 'facebook.com' && path !== '/') return 'facebook';
    if (host === 'linkedin.com' && path.includes('/company/')) return 'linkedin';
    if ((host === 'x.com' || host === 'twitter.com') && path !== '/') return 'x';
    if (host === 'tiktok.com' && path.startsWith('/@')) return 'tiktok';
    if (host === 'youtube.com' && (path.startsWith('/@') || path.startsWith('/channel/') || path.startsWith('/c/'))) return 'youtube';
    if (host === 'pinterest.com' && path !== '/') return 'pinterest';
  } catch {
    return null;
  }
  return null;
};

const normalizeSocialProfileUrl = (url: string) => {
  const parsed = new URL(url);
  parsed.hash = '';
  parsed.search = '';
  return parsed.toString().replace(/\/$/, '');
};

const extractUrlsFromText = (value: string) => {
  return Array.from(value.matchAll(/https?:\/\/[^\s"'<>)]*/gi)).map((match) => match[0].replace(/[.,;]+$/, ''));
};

const extractSocialLinks = (pages: ScrapedPage[]): SocialLink[] => {
  const byPlatform = new Map<string, string>();
  const candidates = pages.flatMap((page) => [
    ...page.links,
    ...extractUrlsFromText(page.html),
    ...extractUrlsFromText(page.markdown),
  ]);

  for (const candidate of candidates) {
    try {
      const normalized = normalizeSocialProfileUrl(candidate);
      const platform = platformFromUrl(normalized);
      if (!platform || byPlatform.has(platform)) continue;
      byPlatform.set(platform, normalized);
    } catch {
      // Ignore non-URL fragments in scraped text.
    }
  }

  return Array.from(byPlatform.entries()).map(([platform, url]) => ({
    type: 'social_link',
    platform,
    url,
  }));
};

const extractCssUrls = (pages: ScrapedPage[]) => {
  const urls = new Set<string>();
  for (const page of pages) {
    for (const match of page.html.matchAll(/<link[^>]+href=["']([^"']+\.css[^"']*)["'][^>]*>/gi)) {
      try {
        urls.add(new URL(match[1], page.url).toString());
      } catch {
        // Ignore invalid stylesheet URLs.
      }
    }
  }
  return Array.from(urls).slice(0, 3);
};

const fetchCssText = async (pages: ScrapedPage[]) => {
  const stylesheets = extractCssUrls(pages);
  const cssParts: string[] = [];
  for (const url of stylesheets) {
    try {
      const response = await fetch(url, { headers: { Accept: 'text/css,*/*' } });
      if (!response.ok) continue;
      cssParts.push((await response.text()).slice(0, 250000));
    } catch {
      // Stylesheets are helpful but not required.
    }
  }
  return cssParts.join('\n');
};

const extractHexColors = (value: string) => {
  return Array.from(value.matchAll(/#[0-9a-fA-F]{3,8}\b/g))
    .map((match) => normalizeHex(match[0]))
    .filter((hex): hex is string => Boolean(hex));
};

const addColorCandidate = (candidates: Map<string, ColorCandidate>, hex: string, score: number, role?: ExtractedColor['role'], label?: string) => {
  const current = candidates.get(hex) || { hex, score: 0 };
  current.score += score;
  current.role ||= role;
  current.label ||= label;
  candidates.set(hex, current);
};

const colorsFromBranding = (pages: ScrapedPage[], candidates: Map<string, ColorCandidate>) => {
  const roleLabels: Record<string, { role: ExtractedColor['role']; label: string }> = {
    primary: { role: 'primary', label: 'Primary' },
    secondary: { role: 'secondary', label: 'Secondary' },
    accent: { role: 'accent', label: 'Accent' },
    background: { role: 'background', label: 'Background' },
    textPrimary: { role: 'neutral', label: 'Text Primary' },
    textSecondary: { role: 'neutral', label: 'Text Secondary' },
    link: { role: 'accent', label: 'Link' },
  };

  for (const page of pages) {
    const colors = (page.branding as { colors?: Record<string, unknown> } | null)?.colors;
    if (!colors || typeof colors !== 'object') continue;
    for (const [key, value] of Object.entries(colors)) {
      const hex = normalizeHex(value);
      const mapping = roleLabels[key] || { role: undefined, label: key };
      if (hex && !isBrowserDefaultColor(hex)) addColorCandidate(candidates, hex, 220, mapping.role, mapping.label);
    }
  }
};

const colorsFromText = (text: string, candidates: Map<string, ColorCandidate>) => {
  const counts = new Map<string, number>();
  for (const hex of extractHexColors(text)) {
    if (hex === '#FFFFFF' || hex === '#000000' || isBrowserDefaultColor(hex)) continue;
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }

  for (const [hex, count] of counts.entries()) {
    const bonus = !isGrayish(hex) ? 60 : 0;
    addColorCandidate(candidates, hex, count + bonus);
  }
};

const selectDistinctColor = (items: ColorCandidate[], selected: ColorCandidate[], predicate: (item: ColorCandidate) => boolean) => {
  return items.find((item) => predicate(item) && selected.every((picked) => rgbDistance(picked.hex, item.hex) > 24));
};

const buildDetectedPalette = async (pages: ScrapedPage[], extraction: ResearchExtraction) => {
  const candidates = new Map<string, ColorCandidate>();
  colorsFromBranding(pages, candidates);
  colorsFromText(pages.map((page) => `${page.html}\n${page.markdown}`).join('\n'), candidates);
  colorsFromText(await fetchCssText(pages), candidates);

  if (!candidates.size && Array.isArray(extraction.colors)) {
    extraction.colors.forEach((color, index) => {
      const hex = normalizeHex(color.hex);
      if (hex && !isBrowserDefaultColor(hex)) addColorCandidate(candidates, hex, 30 - index, color.role, color.name);
    });
  }

  const sorted = Array.from(candidates.values()).sort((left, right) => right.score - left.score);
  const picked: ColorCandidate[] = [];
  const add = (item?: ColorCandidate) => {
    if (item && !picked.some((current) => current.hex === item.hex)) picked.push(item);
  };

  add(selectDistinctColor(sorted, picked, (item) => item.role === 'primary' && !isVeryLight(item.hex)));
  add(selectDistinctColor(sorted, picked, (item) => !isGrayish(item.hex) && !isVeryLight(item.hex)));
  add(selectDistinctColor(sorted, picked, (item) => item.role === 'secondary' && !isVeryLight(item.hex)));
  add(selectDistinctColor(sorted, picked, (item) => !isGrayish(item.hex) && !isVeryLight(item.hex)));
  add(selectDistinctColor(sorted, picked, (item) => item.role === 'accent' && !isVeryLight(item.hex)));
  add(selectDistinctColor(sorted, picked, (item) => !isGrayish(item.hex) && !isVeryLight(item.hex)));
  add(selectDistinctColor(sorted, picked, (item) => item.role === 'neutral' && !isVeryLight(item.hex)));
  add(selectDistinctColor(sorted, picked, (item) => isGrayish(item.hex) && !isVeryLight(item.hex)));
  const background = selectDistinctColor(sorted, picked, (item) => (item.role === 'background' && isVeryLight(item.hex)) || isVeryLight(item.hex));
  if (background) {
    while (picked.length > 4) picked.pop();
    add(background);
  }

  const roles: Array<ExtractedColor['role']> = ['primary', 'secondary', 'accent', 'neutral', 'background'];
  const names = ['Primary Website Color', 'Secondary Website Color', 'Accent Website Color', 'Neutral Website Color', 'Background Website Color'];

  return picked.slice(0, 5).map((item, index) => ({
    name: item.label || names[index],
    role: roles[index] || 'accent',
    hex: item.hex,
  }));
};

async function collectWebsiteContext(websiteUrl: string) {
  const mappedLinks = await mapWebsite(websiteUrl);
  const rootUrl = new URL(websiteUrl);
  const urlMap = new Map<string, { url: string; title: string; description: string }>();
  urlMap.set(websiteUrl, { url: websiteUrl, title: 'Homepage', description: '' });

  for (const link of mappedLinks) {
    try {
      const linkUrl = new URL(link.url, websiteUrl);
      if (linkUrl.hostname !== rootUrl.hostname) continue;
      linkUrl.hash = '';
      linkUrl.search = '';
      const normalized = linkUrl.toString().replace(/\/$/, '');
      urlMap.set(normalized, { url: normalized, title: link.title, description: link.description });
    } catch {
      // Ignore invalid sitemap links.
    }
  }

  const urls = Array.from(urlMap.values())
    .sort((left, right) => pageScore(right.url, right.title, right.description) - pageScore(left.url, left.title, left.description))
    .slice(0, maxPages())
    .map((link) => link.url);

  const pages: ScrapedPage[] = [];
  for (const url of urls) {
    const page = await scrapePage(url);
    if (page) pages.push(page);
  }
  return pages;
}

const toUpdates = (extraction: ResearchExtraction, guide: Record<string, unknown>, brandName: string, websiteUrl: string) => {
  const updates: Record<string, unknown> = {
    brand_name: cleanText(extraction.brand_name, 120) || brandName || cleanText(guide.brand_name, 120) || 'Untitled Brand',
    website_url: websiteUrl,
  };

  const stringFields: Array<keyof ResearchExtraction> = [
    'tagline',
    'industry',
    'target_audience',
    'elevator_pitch',
    'mission',
    'vision',
    'photography_style',
    'illustration_style',
    'iconography_rules',
    'social_rules',
    'ad_rules',
  ];
  for (const field of stringFields) {
    const value = cleanText(extraction[field], field === 'elevator_pitch' ? 2200 : 1600);
    if (value) updates[field] = value;
  }

  const arrayFields: Array<keyof ResearchExtraction> = [
    'brand_values',
    'personality',
    'writing_dos',
    'writing_donts',
    'preferred_terms',
    'avoided_terms',
    'content_pillars',
  ];
  for (const field of arrayFields) {
    const values = cleanArray(extraction[field]);
    if (values) updates[field] = values;
  }

  const sampleCopy = cleanArray(extraction.sample_copy, 8, 260);
  if (sampleCopy) updates.sample_copy = sampleCopy;

  return updates;
};

const websiteResearchSection = (websiteUrl: string, pages: ScrapedPage[], extraction: ResearchExtraction, socialLinks: SocialLink[]) => ({
  type: 'website_research',
  source_type: 'website',
  website_url: websiteUrl,
  generated_at: new Date().toISOString(),
  summary: cleanText(extraction.research_summary, 1200),
  proof_points: cleanArray(extraction.proof_points, 10, 220) || [],
  unknowns: cleanArray(extraction.unknowns, 10, 220) || [],
  social_links: socialLinks.map(({ platform, url }) => ({ platform, url })),
  pages: pages.map((page) => ({
    url: page.url,
    title: page.title,
    description: page.description,
    excerpt: page.markdown.slice(0, 1200),
  })),
});

const mergeCustomSections = (current: unknown, websiteUrl: string, pages: ScrapedPage[], extraction: ResearchExtraction, socialLinks: SocialLink[]) => {
  const sections = Array.isArray(current) ? current.filter((item) => {
    return !(item && typeof item === 'object' && (
      (item as Record<string, unknown>).type === 'website_research' ||
      ((item as Record<string, unknown>).type === 'social_link' && socialLinks.some((link) => link.platform === (item as Record<string, unknown>).platform))
    ));
  }) : [];
  return [websiteResearchSection(websiteUrl, pages, extraction, socialLinks), ...socialLinks, ...sections].slice(0, 40);
};

async function replaceColors(supabase: ReturnType<typeof getUserClient>, guideId: string, colors: unknown) {
  if (!Array.isArray(colors)) return 0;
  const { error: deleteError } = await supabase.from('brand_colors').delete().eq('guide_id', guideId);
  if (deleteError) throw deleteError;
  const existingHex = new Set<string>();
  const rows = colors
    .map((color, index) => {
      const item = color as ExtractedColor;
      const hex = normalizeHex(item.hex);
      if (!hex || existingHex.has(hex) || isBrowserDefaultColor(hex)) return null;
      existingHex.add(hex);
      return {
        guide_id: guideId,
        name: cleanText(item.name, 80) || `Website Color ${index + 1}`,
        role: colorRole(item.role, index === 0 ? 'primary' : index === 1 ? 'secondary' : 'accent'),
        hex,
        sort_order: index,
      };
    })
    .filter((row): row is {
      guide_id: string;
      name: string;
      role: NonNullable<ExtractedColor['role']>;
      hex: string;
      sort_order: number;
    } => Boolean(row));
  if (!rows.length) return 0;
  const { error } = await supabase.from('brand_colors').insert(rows);
  if (error) throw error;
  return rows.length;
}

async function insertFonts(supabase: ReturnType<typeof getUserClient>, guideId: string, fonts: unknown) {
  if (!Array.isArray(fonts)) return 0;
  const { data: existing } = await supabase.from('brand_fonts').select('font_family, category').eq('guide_id', guideId);
  const existingKeys = new Set((existing || []).map((font: { font_family?: string; category?: string }) => `${font.category}:${String(font.font_family || '').toLowerCase()}`));
  const rows = fonts
    .map((font, index) => {
      const item = font as ExtractedFont;
      const family = cleanText(item.family, 120);
      if (!family) return null;
      const category = fontCategory(item.category, index === 0 ? 'heading' : 'body');
      const key = `${category}:${family.toLowerCase()}`;
      if (existingKeys.has(key)) return null;
      existingKeys.add(key);
      return {
        guide_id: guideId,
        font_family: family,
        category,
        source_url: cleanText(item.source_url, 500),
        weight: null,
        license: null,
        type_scale: {},
        sort_order: index,
      };
    })
    .filter((row): row is {
      guide_id: string;
      font_family: string;
      category: NonNullable<ExtractedFont['category']>;
      source_url: string | null;
      weight: null;
      license: null;
      type_scale: Record<string, never>;
      sort_order: number;
    } => Boolean(row));
  if (!rows.length) return 0;
  const { error } = await supabase.from('brand_fonts').insert(rows);
  if (error) throw error;
  return rows.length;
}

async function insertLogos(supabase: ReturnType<typeof getUserClient>, guideId: string, logos: unknown) {
  if (!Array.isArray(logos)) return 0;
  const { data: existing } = await supabase.from('brand_logos').select('file_url').eq('guide_id', guideId);
  const existingUrls = new Set((existing || []).map((logo: { file_url?: string }) => String(logo.file_url || '')));
  const rows = logos
    .map((logo, index) => {
      const item = logo as ExtractedLogo;
      const fileUrl = cleanText(item.file_url, 1000);
      if (!fileUrl || existingUrls.has(fileUrl)) return null;
      existingUrls.add(fileUrl);
      return {
        guide_id: guideId,
        label: cleanText(item.label, 120) || `Website Logo ${index + 1}`,
        variant: logoVariant(item.variant, index === 0 ? 'primary' : 'secondary'),
        file_url: fileUrl,
        format: formatFromUrl(fileUrl),
        dimensions: null,
        sort_order: index,
      };
    })
    .filter((row): row is {
      guide_id: string;
      label: string;
      variant: NonNullable<ExtractedLogo['variant']>;
      file_url: string;
      format: string | null;
      dimensions: null;
      sort_order: number;
    } => Boolean(row));
  if (!rows.length) return 0;
  const { error } = await supabase.from('brand_logos').insert(rows);
  if (error) throw error;
  return rows.length;
}

Deno.serve(async (req) => {
  const methodResponse = requireMethod(req);
  if (methodResponse) return methodResponse;

  try {
    getRequiredSecret('FIRECRAWL_API_KEY');
    getRequiredSecret('OPENROUTER_API_KEY');
    const supabase = getUserClient(req);
    await currentUserId(supabase);

    const { guideId, brandName = '', websiteUrl = '' } = await readJson<RequestBody>(req);
    if (!guideId) return jsonResponse({ error: 'guideId is required' }, 400);
    const normalizedWebsiteUrl = normalizeWebsiteUrl(websiteUrl);
    const normalizedBrandName = cleanText(brandName, 120) || 'Untitled Brand';

    const { data: guide, error: guideError } = await supabase
      .from('brand_guides')
      .select('*')
      .eq('id', guideId)
      .maybeSingle();
    if (guideError) throw guideError;
    if (!guide) return jsonResponse({ error: 'Brand guide was not found in Supabase. Save or recreate it before researching the website.' }, 404);

    const pages = await collectWebsiteContext(normalizedWebsiteUrl);
    if (!pages.length) return jsonResponse({ error: 'No readable website pages were found.' }, 422);

    const extraction = await openRouterJson<ResearchExtraction>({
      model: instantModel(),
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: [
            'You extract brand guide facts for a social media agency.',
            'Return only valid JSON. Do not invent details that are not supported by the scraped pages.',
            'Prefer concise, specific field values that can be pasted into a brand guide.',
            'If a field is unknown, omit it or add the gap under unknowns.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Extract and normalize brand guide fields from website research.',
            requestedBrandName: normalizedBrandName,
            websiteUrl: normalizedWebsiteUrl,
            currentGuide: guide,
            requiredShape: {
              brand_name: 'string',
              tagline: 'string',
              industry: 'string',
              target_audience: 'string',
              elevator_pitch: 'string',
              mission: 'string',
              vision: 'string',
              brand_values: ['string'],
              personality: ['string'],
              writing_dos: ['string'],
              writing_donts: ['string'],
              preferred_terms: ['string'],
              avoided_terms: ['string'],
              sample_copy: ['string'],
              content_pillars: ['string'],
              photography_style: 'string',
              illustration_style: 'string',
              iconography_rules: 'string',
              social_rules: 'string',
              ad_rules: 'string',
              research_summary: 'string',
              proof_points: ['string'],
              unknowns: ['string'],
              colors: [{ name: 'string', role: 'primary|secondary|accent|neutral|background', hex: '#RRGGBB' }],
              fonts: [{ family: 'string', category: 'heading|body|accent|code', source_url: 'string' }],
              logos: [{ label: 'string', file_url: 'string', variant: 'primary|secondary|icon|monochrome|reversed' }],
            },
            pages: pages.map((page) => ({
              url: page.url,
              title: page.title,
              description: page.description,
              markdown: page.markdown,
              branding: page.branding,
            })),
          }),
        },
      ],
    });

    const socialLinks = extractSocialLinks(pages);
    const detectedColors = await buildDetectedPalette(pages, extraction);
    const updates = toUpdates(extraction, guide as Record<string, unknown>, normalizedBrandName, normalizedWebsiteUrl);
    updates.custom_sections = mergeCustomSections(guide.custom_sections, normalizedWebsiteUrl, pages, extraction, socialLinks);

    const { data: updatedGuide, error: updateError } = await supabase
      .from('brand_guides')
      .update(updates)
      .eq('id', guideId)
      .select()
      .single();
    if (updateError) throw updateError;

    const [colorsInserted, fontsInserted, logosInserted] = await Promise.all([
      replaceColors(supabase, guideId, detectedColors.length ? detectedColors : extraction.colors),
      insertFonts(supabase, guideId, extraction.fonts),
      insertLogos(supabase, guideId, extraction.logos),
    ]);

    return jsonResponse({
      guide: updatedGuide,
      sourceCount: pages.length,
      fieldsUpdated: Object.keys(updates).filter((field) => field !== 'custom_sections'),
      socialLinksInserted: socialLinks.length,
      colorsInserted,
      fontsInserted,
      logosInserted,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
