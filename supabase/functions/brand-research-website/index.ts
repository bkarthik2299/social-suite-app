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
  screenshot: string;
  branding?: Record<string, unknown> | null;
  visualSignals?: VisualSignals | null;
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

type LogoCandidate = ExtractedLogo & {
  score: number;
  source: string;
};

type VisualSignalElement = {
  role?: string;
  tag?: string;
  id?: string;
  className?: string;
  text?: string;
  src?: string;
  href?: string;
  backgroundColor?: string;
  color?: string;
  borderColor?: string;
  fill?: string;
  stroke?: string;
};

type VisualSignals = {
  variables?: Array<{ name?: string; value?: string }>;
  elements?: VisualSignalElement[];
  meta?: Array<{ type?: string; url?: string }>;
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
  const parsed = Number.parseInt(Deno.env.get('FIRECRAWL_MAX_PAGES') || '3', 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 4) : 3;
};

const boundedNumberFromEnv = (key: string, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(Deno.env.get(key) || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const firecrawlTimeoutMs = () => boundedNumberFromEnv('FIRECRAWL_TIMEOUT_MS', 16000, 5000, 30000);
const modelTimeoutMs = () => boundedNumberFromEnv('BRAND_RESEARCH_MODEL_TIMEOUT_MS', 16000, 8000, 25000);

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
  const clean = value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, maxLength) : null;
};

const looksLikeBadText = (value: string) => {
  const clean = value.trim();
  if (!clean) return true;
  if (/^(unknown|n\/a|na|null|undefined|none|not specified)$/i.test(clean)) return true;
  if (/(^|\s)#?\s*this page (isn'?t|is not) working\b/i.test(clean)) return true;
  if (/\bHTTP\s+ERROR\s+\d{3}\b/i.test(clean)) return true;
  if (/if the problem continues,\s*contact the site owner/i.test(clean)) return true;
  if (/Base64-Image-Removed/i.test(clean)) return true;
  if (/^Reload\s+If the problem continues/i.test(clean)) return true;
  if (clean.includes('\uFFFD')) return true;
  const mojibakeCount = (clean.match(/[\u00C3\u00C2]|\u00E2[\u0080-\u00BF]/g) || []).length;
  if (mojibakeCount >= 2) return true;
  const letters = (clean.match(/[A-Za-z]/g) || []).length;
  const visible = clean.replace(/\s/g, '').length;
  if (visible > 24 && letters / visible < 0.28) return true;
  const repeatedPunctuation = (clean.match(/[{}[\]<>_=]{2,}/g) || []).length;
  return repeatedPunctuation > 1;
};

const cleanFactText = (value: unknown, maxLength = 1600) => {
  const clean = cleanText(value, maxLength);
  return clean && !looksLikeBadText(clean) ? clean : null;
};

const cleanArray = (value: unknown, maxItems = 12, maxLength = 180) => {
  if (!Array.isArray(value)) return null;
  const clean = value
    .map((item) => cleanFactText(item, maxLength))
    .filter(Boolean) as string[];
  return clean.length ? Array.from(new Set(clean)).slice(0, maxItems) : null;
};

const normalizeHex = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || /var\(|currentColor|transparent/i.test(raw)) return null;
  const hex = raw.toUpperCase();
  const full = /^#[0-9A-F]{6}$/.test(hex) ? hex : null;
  if (full) return full;
  if (/^#[0-9A-F]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (/^#[0-9A-F]{8}$/.test(hex)) {
    const alpha = Number.parseInt(hex.slice(7, 9), 16);
    return alpha < 48 ? null : hex.slice(0, 7);
  }

  const rgbMatch = raw.match(/^rgba?\((.+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1]
      .replace(/,/g, ' ')
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part && part !== '/');
    if (parts.length >= 3) {
      const alpha = parts[3] ? Number.parseFloat(parts[3]) : 1;
      if (Number.isFinite(alpha) && alpha < 0.18) return null;
      const channels = parts.slice(0, 3).map((part) => {
        const numeric = Number.parseFloat(part);
        if (!Number.isFinite(numeric)) return NaN;
        return part.endsWith('%') ? Math.round((numeric / 100) * 255) : Math.round(numeric);
      });
      if (channels.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)) {
        return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
      }
    }
  }

  const hslMatch = raw.match(/^hsla?\((.+)\)$/i);
  if (hslMatch) {
    const parts = hslMatch[1]
      .replace(/,/g, ' ')
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part && part !== '/');
    if (parts.length >= 3) {
      const h = Number.parseFloat(parts[0]);
      const s = Number.parseFloat(parts[1]) / 100;
      const l = Number.parseFloat(parts[2]) / 100;
      const alpha = parts[3] ? Number.parseFloat(parts[3]) : 1;
      if ([h, s, l, alpha].every(Number.isFinite) && alpha >= 0.18) {
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - c / 2;
        const [r1, g1, b1] =
          h < 60 ? [c, x, 0] :
          h < 120 ? [x, c, 0] :
          h < 180 ? [0, c, x] :
          h < 240 ? [0, x, c] :
          h < 300 ? [x, 0, c] :
          [c, 0, x];
        const channels = [r1, g1, b1].map((channel) => Math.round((channel + m) * 255));
        return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
      }
    }
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

const comparableHost = (hostname: string) => hostname.replace(/^www\./i, '').toLowerCase();

const endpoint = (path: string) => `https://api.firecrawl.dev/v2/${path}`;

const visualAuditScript = String.raw`(() => {
  const colorish = (value) => typeof value === 'string' && /#|rgb|hsl/i.test(value) && !/var\(/i.test(value);
  const text = (node) => (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const styleFor = (node, role) => {
    const style = getComputedStyle(node);
    return {
      role,
      tag: node.tagName.toLowerCase(),
      id: node.id || '',
      className: String(node.className || '').slice(0, 180),
      text: text(node),
      src: node.currentSrc || node.src || '',
      href: node.href || '',
      backgroundColor: style.backgroundColor,
      color: style.color,
      borderColor: style.borderColor,
      fill: style.fill,
      stroke: style.stroke,
    };
  };
  const variables = [];
  const rootStyle = getComputedStyle(document.documentElement);
  for (let index = 0; index < rootStyle.length; index += 1) {
    const name = rootStyle[index];
    if (!name || !name.startsWith('--')) continue;
    const value = rootStyle.getPropertyValue(name).trim();
    if (!colorish(value)) continue;
    if (!/(brand|primary|secondary|accent|color|button|link|nav|header|logo|theme|background|foreground|text)/i.test(name)) continue;
    variables.push({ name, value });
    if (variables.length >= 36) break;
  }
  const selectors = [
    ['header', 'header, [role="banner"], .header, #header, .site-header, .navbar'],
    ['nav', 'nav, .nav, .navbar, .menu, .main-menu'],
    ['button', 'button, .button, .btn, .cta, [role="button"], input[type="submit"], a[class*="btn"], a[class*="button"], .shopify-payment-button__button'],
    ['link', 'a[href]'],
    ['heading', 'h1, h2, h3, .heading, .title, .section-title'],
    ['card', '.card, .tile, .product-card, .collection-card, article'],
    ['logo', 'img[src*="logo" i], img[alt*="logo" i], [class*="logo" i] img, header img, nav img, svg[aria-label*="logo" i]'],
  ];
  const elements = [];
  const seen = new Set();
  for (const [role, selector] of selectors) {
    for (const node of Array.from(document.querySelectorAll(selector)).slice(0, role === 'link' ? 8 : 6)) {
      if (!(node instanceof Element) || seen.has(node)) continue;
      seen.add(node);
      elements.push(styleFor(node, role));
      if (elements.length >= 64) break;
    }
  }
  const meta = Array.from(document.querySelectorAll('link[rel*="icon" i], link[rel*="apple-touch-icon" i], meta[property="og:image"], meta[name="twitter:image"]'))
    .map((node) => ({
      type: node.getAttribute('rel') || node.getAttribute('property') || node.getAttribute('name') || '',
      url: node.getAttribute('href') || node.getAttribute('content') || '',
    }))
    .filter((item) => item.url)
    .slice(0, 16);
  return { variables, elements, meta };
})()`;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function firecrawlPost<T>(path: string, body: Record<string, unknown>, requestTimeoutMs = firecrawlTimeoutMs()) {
  const response = await fetchWithTimeout(endpoint(path), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getRequiredSecret('FIRECRAWL_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...body,
      timeout: Math.min(Number(body.timeout || requestTimeoutMs), requestTimeoutMs),
    }),
  }, requestTimeoutMs + 1500);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Website research failed: ${response.status} ${text.slice(0, 300)}`);
  }
  return JSON.parse(text || '{}') as T;
}

async function mapWebsite(url: string) {
  try {
    const timeout = firecrawlTimeoutMs();
    const data = await firecrawlPost<{ success?: boolean; links?: Array<string | { url?: string; title?: string; description?: string }> }>('map', {
      url,
      sitemap: 'include',
      includeSubdomains: false,
      ignoreQueryParameters: true,
      limit: 12,
      timeout,
    }, timeout);
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

const normalizeVisualSignals = (value: unknown): VisualSignals | null => {
  if (typeof value === 'string') {
    try {
      return normalizeVisualSignals(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const input = value as VisualSignals;
  const variables = Array.isArray(input.variables)
    ? input.variables
      .map((item) => ({
        name: cleanText(item?.name, 120) || '',
        value: cleanText(item?.value, 120) || '',
      }))
      .filter((item) => item.name && item.value)
      .slice(0, 40)
    : [];
  const elements = Array.isArray(input.elements)
    ? input.elements
      .map((item) => ({
        role: cleanText(item?.role, 40) || '',
        tag: cleanText(item?.tag, 40) || '',
        id: cleanText(item?.id, 120) || '',
        className: cleanText(item?.className, 220) || '',
        text: cleanText(item?.text, 120) || '',
        src: cleanText(item?.src, 1000) || '',
        href: cleanText(item?.href, 1000) || '',
        backgroundColor: cleanText(item?.backgroundColor, 80) || '',
        color: cleanText(item?.color, 80) || '',
        borderColor: cleanText(item?.borderColor, 80) || '',
        fill: cleanText(item?.fill, 80) || '',
        stroke: cleanText(item?.stroke, 80) || '',
      }))
      .slice(0, 80)
    : [];
  const meta = Array.isArray(input.meta)
    ? input.meta
      .map((item) => ({
        type: cleanText(item?.type, 100) || '',
        url: cleanText(item?.url, 1000) || '',
      }))
      .filter((item) => item.url)
      .slice(0, 20)
    : [];
  return variables.length || elements.length || meta.length ? { variables, elements, meta } : null;
};

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
    const timeout = firecrawlTimeoutMs();
    const data = await firecrawlPost<{
      success?: boolean;
      data?: {
        markdown?: string;
        summary?: string;
        html?: string;
        rawHtml?: string;
        screenshot?: string;
        links?: string[];
        metadata?: Record<string, unknown>;
        branding?: Record<string, unknown>;
        actions?: {
          javascriptReturns?: Array<{ type?: string; value?: unknown }>;
          screenshots?: string[];
        };
      };
    }>('scrape', {
      url,
      formats: ['markdown', 'links', 'branding', 'html', 'rawHtml', { type: 'screenshot', fullPage: false, quality: 80, viewport: { width: 1440, height: 900 } }],
      actions: [
        { type: 'wait', milliseconds: 1000 },
        { type: 'executeJavascript', script: visualAuditScript },
      ],
      onlyMainContent: false,
      onlyCleanContent: false,
      removeBase64Images: true,
      blockAds: true,
      proxy: 'auto',
      timeout,
    }, timeout);
    const page = data.data || {};
    const metadata = page.metadata || {};
    const markdown = cleanText(page.markdown || page.summary, 5000);
    if (!markdown || looksLikeBadText(markdown)) return null;
    const title = cleanFactText(metadata.title, 240) || '';
    const description = cleanFactText(metadata.description, 420) || '';
    return {
      url,
      title,
      description,
      markdown,
      links: Array.isArray(page.links) ? page.links.filter((link): link is string => typeof link === 'string') : [],
      html: cleanText(page.rawHtml || page.html, 120000) || '',
      screenshot: cleanText(page.screenshot || page.actions?.screenshots?.[0], 1000) || '',
      branding: page.branding || null,
      visualSignals: normalizeVisualSignals(page.actions?.javascriptReturns?.[0]?.value),
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
  const genericStylesheet = /(bootstrap|font-?awesome|icomoon|slick|swiper|fancybox|jquery|owl\.carousel|normalize|reset|animate|vendor|judgeme|widget|recharge|yotpo|photoswipe)/i;
  for (const page of pages) {
    for (const match of page.html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi)) {
      try {
        const tag = match[0].toLowerCase();
        const href = match[1];
        if (!tag.includes('stylesheet') && !/\.css(?:[?#]|$)/i.test(href)) continue;
        const absolute = new URL(href, page.url).toString();
        if (genericStylesheet.test(absolute)) continue;
        urls.add(absolute);
      } catch {
        // Ignore invalid stylesheet URLs.
      }
    }
  }
  return Array.from(urls).slice(0, 8);
};

const fetchCssText = async (pages: ScrapedPage[]) => {
  const stylesheets = extractCssUrls(pages);
  const cssParts = await Promise.all(stylesheets.map(async (url) => {
    try {
      const response = await fetchWithTimeout(url, { headers: { Accept: 'text/css,*/*' } }, 2500);
      if (!response.ok) return '';
      return (await response.text()).slice(0, 120000);
    } catch {
      // Stylesheets are helpful but not required.
      return '';
    }
  }));
  return cssParts.filter(Boolean).join('\n');
};

const extractColorValues = (value: string) => {
  return Array.from(value.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi))
    .map((match) => normalizeHex(match[0]))
    .filter((hex): hex is string => Boolean(hex));
};

const addColorCandidate = (candidates: Map<string, ColorCandidate>, hex: string, score: number, role?: ExtractedColor['role'], label?: string) => {
  if (score <= 0) return;
  if (isBrowserDefaultColor(hex)) return;
  if ((hex === '#FFFFFF' || hex === '#000000') && score < 260) return;
  const current = candidates.get(hex) || { hex, score: 0 };
  current.score += score;
  current.role ||= role;
  current.label ||= label;
  candidates.set(hex, current);
};

const colorsFromBranding = (pages: ScrapedPage[], candidates: Map<string, ColorCandidate>) => {
  const addFromValue = (path: string, value: unknown) => {
    if (typeof value !== 'string') return;
    const key = path.toLowerCase();
    const role =
      key.includes('background') ? 'background' :
      key.includes('text') || key.includes('foreground') ? 'neutral' :
      key.includes('secondary') ? 'secondary' :
      key.includes('accent') || key.includes('link') ? 'accent' :
      'primary';
    let score = 120;
    if (key.includes('buttonprimary') || (key.includes('button') && key.includes('background'))) score = 480;
    else if (key.includes('buttonsecondary') || key.includes('button')) score = 340;
    else if (key.includes('primary')) score = 380;
    else if (key.includes('secondary')) score = 300;
    else if (key.includes('accent') || key.includes('link')) score = 300;
    else if (key.includes('nav') || key.includes('header') || key.includes('logo')) score = 320;
    else if (key.includes('background')) score = 170;
    else if (key.includes('text')) score = 110;
    for (const hex of extractColorValues(value)) addColorCandidate(candidates, hex, score, role, path.split('.').slice(-1)[0] || 'Firecrawl Branding');
  };
  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string') {
      addFromValue(path, value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}.${index}`));
      return;
    }
    if (value && typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([key, child]) => walk(child, path ? `${path}.${key}` : key));
    }
  };
  for (const page of pages) {
    walk(page.branding, 'branding');
  }
};

const colorsFromText = (text: string, candidates: Map<string, ColorCandidate>) => {
  const counts = new Map<string, number>();
  for (const hex of extractColorValues(text)) {
    if (hex === '#FFFFFF' || hex === '#000000' || isBrowserDefaultColor(hex)) continue;
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }

  for (const [hex, count] of counts.entries()) {
    const bonus = !isGrayish(hex) ? 60 : 0;
    addColorCandidate(candidates, hex, count + bonus);
  }
};

const scoreCssContext = (context: string, property: string) => {
  const target = `${context} ${property}`.toLowerCase();
  if (/(^|[\s.#])(?:rf-|pswp|jdgm|judgeme|recharge|fancybox|slick|swiper|yotpo)/.test(target)) {
    return { score: 0, role: undefined, label: 'Vendor Color' };
  }
  let score = 40;
  let role: ExtractedColor['role'] | undefined;
  let label = 'Website Color';
  if (/--.*(brand|primary|theme|accent|secondary|button|link|nav|header|logo)/.test(target)) score += 300;
  if (/(brand|logo)/.test(target)) {
    score += 320;
    role = 'primary';
    label = 'Brand/Logo Color';
  }
  if (/(button|btn|cta|primary-button|shopify-payment-button)/.test(target)) {
    score += 420;
    role = 'primary';
    label = 'Button Color';
  }
  if (/(^|[\s,>+.])a[:.\[#\s]|link/.test(target)) {
    score += 280;
    role ||= 'accent';
    label = 'Link Color';
  }
  if (/(header|navbar|nav|menu|masthead)/.test(target)) {
    score += 300;
    role ||= 'primary';
    label = 'Navigation Color';
  }
  if (/(h1|h2|h3|heading|title)/.test(target)) {
    score += 170;
    role ||= 'primary';
    label = 'Heading Color';
  }
  if (/(card|tile|panel|product-card|collection-card)/.test(target)) {
    score += 130;
    role ||= property.includes('background') ? 'background' : 'neutral';
    label = 'Card Color';
  }
  if (/border/.test(property)) {
    score += 105;
    role ||= 'neutral';
    label = 'Border Color';
  }
  if (/(hero|banner|slider|carousel|gallery|photo|image)/.test(target)) score -= 120;
  if (/background/.test(property)) score += 45;
  return { score: Math.max(score, 25), role, label };
};

const colorsFromCss = (css: string, candidates: Map<string, ColorCandidate>, baseScore = 0) => {
  for (const match of css.matchAll(/--([\w-]+)\s*:\s*([^;{}]+);/g)) {
    const variableName = match[1].toLowerCase();
    if (/^(bs|tw|swiper|slick|fa|wp--preset|wp--style|rf|pswp|jdgm|judgeme|recharge|yotpo)/.test(variableName)) continue;
    if (!/(brand|primary|secondary|accent|button|link|nav|header|logo|theme|background|foreground|text|color)/.test(variableName)) continue;
    const context = `--${match[1]}`;
    const scored = scoreCssContext(context, 'variable');
    for (const hex of extractColorValues(match[2])) {
      addColorCandidate(candidates, hex, scored.score + baseScore + 140, scored.role, `CSS ${context}`);
    }
  }

  for (const rule of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    const selector = rule[1].slice(-260);
    const body = rule[2];
    for (const declaration of body.matchAll(/(background(?:-color)?|color|border(?:-[a-z]+)?-color|fill|stroke)\s*:\s*([^;{}]+)/gi)) {
      const property = declaration[1].toLowerCase();
      const scored = scoreCssContext(selector, property);
      for (const hex of extractColorValues(declaration[2])) {
        addColorCandidate(candidates, hex, scored.score + baseScore, scored.role, scored.label);
      }
    }
  }
};

const colorsFromInlineHtml = (pages: ScrapedPage[], candidates: Map<string, ColorCandidate>) => {
  for (const page of pages) {
    for (const styleBlock of page.html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
      colorsFromCss(styleBlock[1], candidates, 40);
    }
    for (const match of page.html.matchAll(/<([a-z0-9-]+)([^>]*)\sstyle=["']([^"']+)["'][^>]*>/gi)) {
      const context = `${match[1]} ${match[2]}`.slice(0, 260);
      for (const declaration of match[3].matchAll(/(background(?:-color)?|color|border(?:-[a-z]+)?-color|fill|stroke)\s*:\s*([^;]+)/gi)) {
        const scored = scoreCssContext(context, declaration[1].toLowerCase());
        for (const hex of extractColorValues(declaration[2])) addColorCandidate(candidates, hex, scored.score + 60, scored.role, scored.label);
      }
    }
  }
};

const colorsFromVisualSignals = (pages: ScrapedPage[], candidates: Map<string, ColorCandidate>) => {
  for (const page of pages) {
    const signals = page.visualSignals;
    if (!signals) continue;
    for (const variable of signals.variables || []) {
      const scored = scoreCssContext(`--${variable.name || ''}`, 'variable');
      for (const hex of extractColorValues(variable.value || '')) addColorCandidate(candidates, hex, scored.score + 190, scored.role, `CSS ${variable.name}`);
    }
    for (const element of signals.elements || []) {
      const context = `${element.role || ''} ${element.tag || ''} ${element.id || ''} ${element.className || ''} ${element.text || ''}`;
      const fields: Array<[keyof VisualSignalElement, string]> = [
        ['backgroundColor', 'background-color'],
        ['color', 'color'],
        ['borderColor', 'border-color'],
        ['fill', 'fill'],
        ['stroke', 'stroke'],
      ];
      for (const [field, property] of fields) {
        const scored = scoreCssContext(context, property);
        const bonus = element.role === 'logo' ? 240 : element.role === 'button' ? 160 : element.role === 'header' || element.role === 'nav' ? 130 : 0;
        for (const hex of extractColorValues(String(element[field] || ''))) addColorCandidate(candidates, hex, scored.score + bonus, scored.role, scored.label);
      }
    }
  }
};

const attrMap = (tag: string) => {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) {
    attrs[match[1].toLowerCase()] = match[3];
  }
  return attrs;
};

const absolutizeUrl = (value: unknown, baseUrl: string) => {
  const clean = cleanText(value, 1200);
  if (!clean || clean.startsWith('data:') || clean.startsWith('blob:')) return null;
  const first = clean.split(',')[0]?.trim().split(/\s+/)[0] || clean;
  try {
    return new URL(first, baseUrl).toString();
  } catch {
    return null;
  }
};

const isLikelyImageUrl = (url: string) => /\.(svg|png|jpe?g|webp|gif|ico)(?:[?#]|$)/i.test(url) || /image|logo|favicon|cdn\/shop|wp-content\/uploads/i.test(url);

const scoreLogoCandidate = (url: string, label: string, context: string, source: string, brandName: string) => {
  const haystack = `${url} ${label} ${context} ${source}`.toLowerCase();
  let score = 0;
  if (source.includes('firecrawl-branding')) score += 120;
  if (source.includes('favicon')) score += 82;
  if (source.includes('meta')) score += 34;
  if (haystack.includes('logo')) score += 86;
  if (haystack.includes('brand')) score += 42;
  if (brandName && haystack.includes(brandName.toLowerCase())) score += 42;
  if (/header|heading|navbar|nav|site-logo|main_logo/.test(haystack)) score += 34;
  if (/favicon|apple-touch-icon|site-icon/.test(haystack)) score += 58;
  if (/\.svg(?:[?#]|$)/.test(url)) score += 18;
  if (/\.(png|webp)(?:[?#]|$)/.test(url)) score += 8;
  if (/social|facebook|instagram|linkedin|twitter|youtube|whatsapp|payment|visa|mastercard|gallery|banner|hero|slider|carousel|product|thumb|avatar|user|review|arrow|chevron|caret|dropdown/.test(haystack)) score -= 70;
  return score;
};

const addLogoCandidate = (items: LogoCandidate[], existing: Set<string>, pageUrl: string, url: unknown, options: {
  brandName: string;
  label?: string;
  context?: string;
  source: string;
  variant?: ExtractedLogo['variant'];
  score?: number;
}) => {
  const absolute = absolutizeUrl(url, pageUrl);
  if (!absolute || !isLikelyImageUrl(absolute)) return;
  const key = absolute.replace(/([?&])width=\d+/i, '$1').replace(/([?&])height=\d+/i, '$1').split('#')[0];
  if (existing.has(key)) return;
  const providedLabel = cleanText(options.label, 120) || '';
  const score = options.score ?? scoreLogoCandidate(absolute, providedLabel, options.context || '', options.source, options.brandName);
  const minScore = options.source === 'html-image' ? 72 : 55;
  if (score < minScore) return;
  existing.add(key);
  items.push({
    label: providedLabel || (options.variant === 'icon' ? 'Website Favicon' : 'Website Logo'),
    file_url: absolute,
    variant: options.variant || (options.source.includes('favicon') ? 'icon' : 'primary'),
    score,
    source: options.source,
  });
};

const buildLogoCandidates = (pages: ScrapedPage[], extraction: ResearchExtraction, brandName: string) => {
  const candidates: LogoCandidate[] = [];
  const existing = new Set<string>();
  for (const page of pages) {
    const branding = page.branding as {
      logo?: unknown;
      images?: { logo?: unknown; favicon?: unknown; ogImage?: unknown };
    } | null;
    addLogoCandidate(candidates, existing, page.url, branding?.logo, { brandName, label: `${brandName} Logo`, source: 'firecrawl-branding-logo', score: 180 });
    addLogoCandidate(candidates, existing, page.url, branding?.images?.logo, { brandName, label: `${brandName} Logo`, source: 'firecrawl-branding-images-logo', score: 175 });
    addLogoCandidate(candidates, existing, page.url, branding?.images?.favicon, { brandName, label: `${brandName} Favicon`, source: 'firecrawl-branding-favicon', variant: 'icon', score: 120 });
    addLogoCandidate(candidates, existing, page.url, branding?.images?.ogImage, { brandName, label: `${brandName} Social Preview`, source: 'firecrawl-branding-og-image', score: 60 });

    for (const item of page.visualSignals?.meta || []) {
      addLogoCandidate(candidates, existing, page.url, item.url, {
        brandName,
        label: item.type?.includes('icon') ? `${brandName} Favicon` : `${brandName} Social Preview`,
        source: item.type?.includes('icon') ? 'rendered-meta-favicon' : 'rendered-meta-image',
        variant: item.type?.includes('icon') ? 'icon' : 'primary',
      });
    }

    for (const tag of page.html.matchAll(/<meta\b[^>]*>/gi)) {
      const attrs = attrMap(tag[0]);
      const metaName = attrs.property || attrs.name || '';
      if (/^(og:image|twitter:image)$/i.test(metaName)) {
        addLogoCandidate(candidates, existing, page.url, attrs.content, { brandName, label: `${brandName} Social Preview`, source: 'html-meta-image' });
      }
    }
    for (const tag of page.html.matchAll(/<link\b[^>]*>/gi)) {
      const attrs = attrMap(tag[0]);
      if (/icon/i.test(attrs.rel || '')) {
        addLogoCandidate(candidates, existing, page.url, attrs.href, { brandName, label: `${brandName} Favicon`, source: 'html-favicon', variant: 'icon' });
      }
    }
    for (const tag of page.html.matchAll(/<(img|source)\b[^>]*>/gi)) {
      const attrs = attrMap(tag[0]);
      const src = attrs.src || attrs['data-src'] || attrs['data-lazy-src'] || attrs.srcset;
      const context = `${attrs.alt || ''} ${attrs.class || ''} ${attrs.id || ''} ${attrs.loading || ''}`;
      addLogoCandidate(candidates, existing, page.url, src, {
        brandName,
        label: attrs.alt || '',
        context,
        source: 'html-image',
      });
    }
  }

  if (Array.isArray(extraction.logos)) {
    extraction.logos.forEach((logo, index) => {
      addLogoCandidate(candidates, existing, pages[0]?.url || '', logo.file_url, {
        brandName,
        label: logo.label,
        source: 'model-logo',
        variant: logo.variant,
        score: 95 - index,
      });
    });
  }

  const sorted = candidates.sort((left, right) => right.score - left.score);
  const picked: LogoCandidate[] = [];
  const pick = (item?: LogoCandidate) => {
    if (item && !picked.some((current) => current.file_url === item.file_url)) picked.push(item);
  };
  pick(sorted.find((item) => item.variant !== 'icon'));
  pick(sorted.find((item) => item.variant === 'icon'));
  for (const item of sorted) {
    if (picked.length >= 3) break;
    if (item.score >= 125) pick(item);
  }

  return picked
    .map(({ score: _score, source: _source, ...logo }, index) => ({
      ...logo,
      variant: logo.variant || (index === 0 ? 'primary' : 'secondary'),
    }));
};

const colorsFromLogoAssets = async (logos: ExtractedLogo[], candidates: Map<string, ColorCandidate>) => {
  const svgLogos = logos
    .map((logo) => cleanText(logo.file_url, 1000))
    .filter((url): url is string => Boolean(url && /\.svg(?:[?#]|$)/i.test(url)))
    .slice(0, 4);
  const parts = await Promise.all(svgLogos.map(async (url) => {
    try {
      const response = await fetchWithTimeout(url, { headers: { Accept: 'image/svg+xml,text/plain,*/*' } }, 3000);
      if (!response.ok) return '';
      return (await response.text()).slice(0, 80000);
    } catch {
      return '';
    }
  }));
  for (const svg of parts) {
    for (const hex of extractColorValues(svg)) addColorCandidate(candidates, hex, 520, 'primary', 'Logo Color');
  }
};

const buildFontCandidates = (pages: ScrapedPage[], extraction: ResearchExtraction) => {
  const fonts: ExtractedFont[] = [];
  const seen = new Set<string>();
  const add = (family: unknown, category: ExtractedFont['category'], sourceUrl?: string) => {
    const cleanFamily = cleanFactText(family, 120);
    if (!cleanFamily || /^(inherit|initial|unset|system-ui|sans-serif|serif|monospace)$/i.test(cleanFamily)) return;
    const firstFamily = cleanFamily.split(',')[0]?.replace(/^["']|["']$/g, '').trim();
    if (!firstFamily) return;
    const key = `${category}:${firstFamily.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    fonts.push({ family: firstFamily, category, source_url: sourceUrl });
  };

  for (const page of pages) {
    const branding = page.branding as {
      fonts?: Array<{ family?: unknown }>;
      typography?: { fontFamilies?: Record<string, unknown> };
    } | null;
    (branding?.fonts || []).forEach((font, index) => add(font.family, index === 0 ? 'heading' : 'body', page.url));
    const fontFamilies = branding?.typography?.fontFamilies || {};
    add(fontFamilies.heading, 'heading', page.url);
    add(fontFamilies.primary, 'body', page.url);
    add(fontFamilies.body, 'body', page.url);
    add(fontFamilies.code, 'code', page.url);
  }

  if (Array.isArray(extraction.fonts)) {
    extraction.fonts.forEach((font) => add(font.family, font.category || 'body', font.source_url));
  }

  return fonts.slice(0, 8);
};

const selectDistinctColor = (items: ColorCandidate[], selected: ColorCandidate[], predicate: (item: ColorCandidate) => boolean) => {
  return items.find((item) => predicate(item) && selected.every((picked) => rgbDistance(picked.hex, item.hex) > 24));
};

const buildDetectedPalette = async (pages: ScrapedPage[], extraction: ResearchExtraction, logoCandidates: ExtractedLogo[]) => {
  const candidates = new Map<string, ColorCandidate>();
  colorsFromBranding(pages, candidates);
  colorsFromVisualSignals(pages, candidates);
  colorsFromInlineHtml(pages, candidates);
  colorsFromCss(await fetchCssText(pages), candidates, 25);
  await colorsFromLogoAssets(logoCandidates, candidates);
  colorsFromText(pages.map((page) => `${page.html}\n${page.markdown}`).join('\n'), candidates);

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
      if (comparableHost(linkUrl.hostname) !== comparableHost(rootUrl.hostname)) continue;
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

  const settled = await Promise.allSettled(urls.map((url) => scrapePage(url)));
  return settled
    .map((result) => result.status === 'fulfilled' ? result.value : null)
    .filter((page): page is ScrapedPage => Boolean(page));
}

const fallbackExtraction = (pages: ScrapedPage[], brandName: string, websiteUrl: string): ResearchExtraction => {
  const homepage = pages[0];
  const proofPoints = pages
    .map((page) => cleanFactText(`${page.title || page.url}: ${page.description || page.markdown.slice(0, 220)}`, 260))
    .filter(Boolean) as string[];

  return {
    brand_name: brandName,
    tagline: deriveTagline(pages, brandName),
    elevator_pitch: deriveElevatorPitch(pages) || homepage?.markdown.slice(0, 420),
    research_summary: `Website research reviewed ${pages.length} readable page${pages.length === 1 ? '' : 's'} from ${websiteUrl}. Detailed AI extraction was skipped or timed out, so these fields were filled from the scraped website text and detected assets.`,
    proof_points: proofPoints.slice(0, 6),
    unknowns: ['Review tone, audience, and positioning manually if the scraped pages did not state them clearly.'],
  };
};

const words = (value: string) => value.split(/\s+/).filter(Boolean);

const isSeoishTagline = (value: string) => {
  const lower = value.toLowerCase();
  return /(official site|home page|best price|buy online|top builders|real estate developers|privacy policy|terms|contact us|login|sign up)/i.test(lower);
};

const normalizeTaglineCandidate = (value: unknown, brandName: string) => {
  const clean = cleanFactText(value, 160);
  if (!clean) return null;
  const stripped = clean.replace(/\s*[|:;/\\-]\s*$/g, '').trim();
  const count = words(stripped).length;
  if (count < 2 || count > 14 || stripped.length > 110) return null;
  if (isSeoishTagline(stripped)) return null;
  if (brandName && stripped.toLowerCase() === brandName.toLowerCase()) return null;
  return stripped;
};

function deriveTagline(pages: ScrapedPage[], brandName: string) {
  const candidates: string[] = [];
  for (const page of pages.slice(0, 3)) {
    const titleParts = page.title
      .split(/\s[|:;/\\-]\s|[|]/)
      .map((part) => part.trim())
      .filter(Boolean);
    candidates.push(...titleParts);
    if (page.description && words(page.description).length <= 14) candidates.push(page.description);
  }

  for (const candidate of candidates) {
    const normalized = normalizeTaglineCandidate(candidate, brandName);
    if (!normalized) continue;
    if (brandName && normalized.toLowerCase().includes(brandName.toLowerCase()) && words(normalized).length <= 3) continue;
    return normalized;
  }
  return undefined;
}

function deriveElevatorPitch(pages: ScrapedPage[]) {
  for (const page of pages) {
    const description = cleanFactText(page.description, 420);
    if (description && words(description).length >= 8) return description;
  }
  const homepage = pages[0];
  return cleanFactText(homepage?.markdown?.slice(0, 420), 420) || undefined;
}

const compactGuideForModel = (guide: Record<string, unknown>) => ({
  brand_name: guide.brand_name,
  website_url: guide.website_url,
  tagline: guide.tagline,
  industry: guide.industry,
  target_audience: guide.target_audience,
  elevator_pitch: guide.elevator_pitch,
  mission: guide.mission,
  vision: guide.vision,
  brand_values: guide.brand_values,
  personality: guide.personality,
  content_pillars: guide.content_pillars,
});

const toUpdates = (extraction: ResearchExtraction, guide: Record<string, unknown>, brandName: string, websiteUrl: string, pages: ScrapedPage[]) => {
  const updates: Record<string, unknown> = {
    brand_name: cleanFactText(extraction.brand_name, 120) || brandName || cleanFactText(guide.brand_name, 120) || 'Untitled Brand',
    website_url: websiteUrl,
  };

  const stringFields: Array<[keyof ResearchExtraction, number]> = [
    ['industry', 160],
    ['target_audience', 900],
    ['elevator_pitch', 2200],
    ['mission', 1200],
    ['vision', 1200],
    ['photography_style', 1200],
    ['illustration_style', 1200],
    ['iconography_rules', 1200],
    ['social_rules', 1200],
    ['ad_rules', 1200],
  ];
  for (const [field, maxLength] of stringFields) {
    const value = cleanFactText(extraction[field], maxLength);
    if (value) updates[field] = value;
  }

  const tagline = normalizeTaglineCandidate(extraction.tagline, brandName) || deriveTagline(pages, brandName);
  if (tagline) updates.tagline = tagline;
  if (!updates.elevator_pitch) {
    const pitch = deriveElevatorPitch(pages);
    if (pitch) updates.elevator_pitch = pitch;
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
    screenshot: page.screenshot,
    excerpt: page.markdown.slice(0, 1200),
    visual_signal_count: (page.visualSignals?.variables?.length || 0) + (page.visualSignals?.elements?.length || 0),
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

    let extraction: ResearchExtraction;
    try {
      extraction = await withTimeout(openRouterJson<ResearchExtraction>({
        model: instantModel(),
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: [
              'You extract brand guide facts for a social media agency.',
              'Return only valid JSON. Do not invent details that are not supported by the scraped pages.',
              'Prefer concise, specific field values that can be pasted into a brand guide.',
              'The tagline must be a short slogan or offer, not a full SEO page title; omit it if the site has no clear tagline.',
              'Never return mojibake, raw CSS, placeholder text, navigation menus, or cookie-banner copy as brand facts.',
              'Visual assets and colors are supplied as rendered Firecrawl signals; use them only when they clearly identify the brand.',
              'If a field is unknown, omit it or add the gap under unknowns.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              task: 'Extract and normalize brand guide fields from website research.',
              requestedBrandName: normalizedBrandName,
              websiteUrl: normalizedWebsiteUrl,
              currentGuide: compactGuideForModel(guide as Record<string, unknown>),
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
                markdown: page.markdown.slice(0, 3000),
                branding: page.branding,
                screenshot: page.screenshot,
                visualSignals: {
                  variables: page.visualSignals?.variables?.slice(0, 20) || [],
                  elements: page.visualSignals?.elements?.slice(0, 36) || [],
                  meta: page.visualSignals?.meta?.slice(0, 12) || [],
                },
              })),
            }),
          },
        ],
      }), modelTimeoutMs(), 'Brand field extraction timed out.');
    } catch (error) {
      console.warn('Brand field extraction fallback:', error instanceof Error ? error.message : error);
      extraction = fallbackExtraction(pages, normalizedBrandName, normalizedWebsiteUrl);
    }

    const socialLinks = extractSocialLinks(pages);
    const logoCandidates = buildLogoCandidates(pages, extraction, normalizedBrandName);
    const fontCandidates = buildFontCandidates(pages, extraction);
    const detectedColors = await buildDetectedPalette(pages, extraction, logoCandidates);
    const updates = toUpdates(extraction, guide as Record<string, unknown>, normalizedBrandName, normalizedWebsiteUrl, pages);
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
      insertFonts(supabase, guideId, fontCandidates.length ? fontCandidates : extraction.fonts),
      insertLogos(supabase, guideId, logoCandidates.length ? logoCandidates : extraction.logos),
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
