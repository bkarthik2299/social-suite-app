import type {
  BlogOutlineDraft,
  BriefToCampaignArtifact,
  CalendarDraft,
  GoogleAdDraft,
  SocialAdDraft,
  SocialPostDraft,
} from '@/types/ai';

type JsonRecord = Record<string, unknown>;

const calendarTypes = ['socials', 'google-ad', 'meta-ad', 'blogs'] as const;

export function normalizeBriefToCampaignArtifact(input: unknown): BriefToCampaignArtifact {
  const source = unwrapCampaignPack(input);

  return {
    strategy: normalizeStrategy(source),
    socialPosts: normalizeSocialPosts(source.socialPosts ?? source.social_posts ?? source.posts),
    googleAds: normalizeGoogleAds(source.googleAds ?? source.google_ads),
    socialAds: normalizeSocialAds(source.socialAds ?? source.social_ads ?? source.paidSocialAds ?? source.paid_social_ads),
    blogOutlines: normalizeBlogOutlines(source.blogOutlines ?? source.blog_outlines ?? source.blogs),
    calendar: normalizeCalendar(source.calendar ?? source.contentCalendar ?? source.content_calendar ?? source.schedule),
  };
}

function unwrapCampaignPack(input: unknown): JsonRecord {
  const source = asRecord(input);
  const candidates = [
    source.campaignPack,
    source.campaign_pack,
    source.pack,
    source.artifact,
    source.output,
    source.result,
    source.content,
  ];
  for (const candidate of candidates) {
    if (isRecord(candidate)) return candidate;
  }
  return source;
}

function normalizeStrategy(source: JsonRecord): BriefToCampaignArtifact['strategy'] {
  const strategy = asRecord(source.strategy ?? source.campaign_strategy ?? source.plan);
  const title = stringValue(strategy.title ?? strategy.name ?? source.campaign_name) || 'Campaign Strategy';
  const summary = stringValue(strategy.summary)
    || joinText([
      strategy.objective,
      strategy.key_message,
      strategy.approach,
      strategy.cta_primary ? `Primary CTA: ${stringValue(strategy.cta_primary)}` : '',
    ])
    || 'Campaign pack is ready for review.';

  return {
    title,
    summary,
    objectives: stringArray(strategy.objectives ?? strategy.objective),
    contentPillars: stringArray(strategy.contentPillars ?? strategy.content_pillars ?? strategy.pillars),
  };
}

function normalizeSocialPosts(input: unknown): SocialPostDraft[] {
  return recordArray(input).map((item, index) => {
    const platforms = normalizePlatforms(item.platforms ?? item.platform ?? item.channel);
    const headline = stringValue(item.headline ?? item.title ?? item.name);
    const body = stringValue(item.caption ?? item.body ?? item.copy ?? item.text);
    const cta = stringValue(item.cta);
    const hashtags = stringValue(item.hashtags);

    return {
      name: stringValue(item.name) || headline || `Social Post ${index + 1}`,
      topic: stringValue(item.topic ?? item.post_type ?? item.format) || headline || `Social post ${index + 1}`,
      caption: joinText([headline, body, cta ? `CTA: ${cta}` : '', hashtags]),
      platforms,
      scheduledDate: normalizeOptionalDate(item.scheduledDate ?? item.scheduled_date ?? item.date),
      creativeBrief: stringValue(item.creativeBrief ?? item.creative_brief ?? item.visual_description ?? item.visual) || undefined,
    };
  });
}

function normalizeGoogleAds(input: unknown): GoogleAdDraft[] {
  return recordArray(input).map((item, index) => {
    const headlines = uniqueStrings([
      ...stringArray(item.headlines),
      item.headline,
      item.headline_1,
      item.headline_2,
      item.headline_3,
    ]);
    const descriptions = uniqueStrings([
      ...stringArray(item.descriptions),
      item.description,
      item.description_1,
      item.description_2,
      item.body,
    ]);

    return {
      name: stringValue(item.name ?? item.ad_name ?? item.ad_type) || `Google Ad ${index + 1}`,
      topic: stringValue(item.topic ?? item.ad_type) || 'Search campaign concept',
      startDate: normalizeOptionalDate(item.startDate ?? item.start_date ?? item.date),
      finalUrl: stringValue(item.finalUrl ?? item.final_url ?? item.link) || undefined,
      path1: stringValue(item.path1 ?? item.path_1) || undefined,
      path2: stringValue(item.path2 ?? item.path_2) || undefined,
      headlines,
      descriptions,
      callouts: stringArray(item.callouts).length ? stringArray(item.callouts) : undefined,
    };
  });
}

function normalizeSocialAds(input: unknown): SocialAdDraft[] {
  return recordArray(input).map((item, index) => ({
    name: stringValue(item.name ?? item.ad_name ?? item.ad_type) || `Paid Social Ad ${index + 1}`,
    topic: stringValue(item.topic ?? item.ad_type) || 'Paid social concept',
    platform: normalizeSocialAdPlatform(item.platform ?? item.channel),
    primaryText: stringValue(item.primaryText ?? item.primary_text ?? item.body ?? item.copy ?? item.text),
    headline: stringValue(item.headline ?? item.title) || `Paid Social Ad ${index + 1}`,
    description: stringValue(item.description ?? item.visual_description) || undefined,
    cta: normalizeSocialAdCta(item.cta),
    destinationUrl: stringValue(item.destinationUrl ?? item.destination_url ?? item.final_url ?? item.link) || undefined,
    scheduledDate: normalizeOptionalDate(item.scheduledDate ?? item.scheduled_date ?? item.date),
  }));
}

function normalizeBlogOutlines(input: unknown): BlogOutlineDraft[] {
  return recordArray(input).map((item, index) => {
    const title = stringValue(item.title ?? item.name) || `Blog Outline ${index + 1}`;
    const outline = stringArray(item.outline ?? item.sections);
    const introduction = stringValue(item.introduction);
    const conclusion = stringValue(item.conclusion);

    return {
      title,
      slug: stringValue(item.slug) || slugify(title),
      excerpt: stringValue(item.excerpt ?? item.summary) || introduction,
      metaTitle: stringValue(item.metaTitle ?? item.meta_title) || title,
      metaDescription: stringValue(item.metaDescription ?? item.meta_description) || stringValue(item.excerpt ?? item.summary ?? item.conclusion),
      keywords: stringArray(item.keywords),
      outline: outline.length ? outline : stringArray([introduction, conclusion]),
      publishDate: normalizeOptionalDate(item.publishDate ?? item.publish_date ?? item.date),
    };
  });
}

function normalizeCalendar(input: unknown): CalendarDraft[] {
  const flattened = flattenCalendar(input);
  return flattened.map((item, index) => {
    const title = stringValue(item.title ?? item.name ?? item.copy ?? item.text ?? item.value) || `Campaign touchpoint ${index + 1}`;
    return {
      title,
      type: normalizeCalendarType(item.type, title),
      date: normalizeDate(item.date ?? item.event_date ?? item.scheduledDate ?? item.scheduled_date, item.key, index),
    };
  }).filter((item) => item.title.trim().length > 0);
}

function flattenCalendar(input: unknown, key?: string): JsonRecord[] {
  if (Array.isArray(input)) {
    return input.flatMap((item, index) => flattenCalendar(item, key ?? `day_${index + 1}`));
  }

  if (typeof input === 'string') {
    return [{ key, title: input }];
  }

  if (!isRecord(input)) return [];
  if ('title' in input || 'date' in input || 'event_date' in input || 'scheduledDate' in input || 'scheduled_date' in input) {
    return [{ ...input, key }];
  }

  return Object.entries(input).flatMap(([entryKey, value]) => {
    if (typeof value === 'string') return [{ key: entryKey, title: value }];
    if (isRecord(value) && ('title' in value || 'date' in value || 'event_date' in value)) return [{ ...value, key: entryKey }];
    return flattenCalendar(value, entryKey);
  });
}

function recordArray(input: unknown): JsonRecord[] {
  if (Array.isArray(input)) {
    return input.map(asRecord).filter((item) => Object.keys(item).length > 0);
  }
  if (isRecord(input)) {
    return Object.values(input).map(asRecord).filter((item) => Object.keys(item).length > 0);
  }
  return [];
}

function normalizePlatforms(input: unknown): string[] {
  const values = stringArray(input);
  if (values.some((item) => stringValue(item).toLowerCase() === 'all')) {
    return ['linkedin', 'instagram', 'facebook'];
  }

  const platforms = uniqueStrings(values.map(toSocialPlatform).filter(Boolean));
  if (platforms.length) return platforms;

  const value = stringValue(input);
  const platform = toSocialPlatform(value);
  return platform ? [platform] : ['linkedin', 'instagram', 'facebook'];
}

function normalizeCalendarType(input: unknown, title: string): CalendarDraft['type'] {
  const value = stringValue(input).toLowerCase();
  if ((calendarTypes as readonly string[]).includes(value)) return value as CalendarDraft['type'];

  const text = `${value} ${title}`.toLowerCase();
  if (text.includes('blog')) return 'blogs';
  if (text.includes('google') || text.includes('search ad') || text.includes('display ad')) return 'google-ad';
  if (text.includes('paid') || text.includes('ad ') || text.includes(' ad') || text.includes('sponsored')) return 'meta-ad';
  return 'socials';
}

function normalizeDate(input: unknown, key: unknown, index: number): string {
  const explicit = stringValue(input);
  if (explicit) {
    const todayIso = localDateString(startOfToday());
    if (/^\d{4}-\d{2}-\d{2}$/.test(explicit) && explicit >= todayIso) return explicit;

    const parsed = new Date(explicit);
    if (!Number.isNaN(parsed.getTime())) {
      const today = startOfToday();
      if (parsed >= today) return localDateString(parsed);
    }
  }

  const keyValue = stringValue(key);
  const dayMatch = keyValue.match(/day[_\s-]*(\d+)/i);
  const offset = dayMatch ? Math.max(Number(dayMatch[1]) - 1, 0) : index;
  const date = startOfToday();
  date.setDate(date.getDate() + offset);
  return localDateString(date);
}

function normalizeOptionalDate(input: unknown): string | undefined {
  const explicit = stringValue(input);
  if (!explicit) return undefined;

  const todayIso = localDateString(startOfToday());
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) {
    return explicit >= todayIso ? explicit : undefined;
  }

  const parsed = new Date(explicit);
  if (Number.isNaN(parsed.getTime())) return undefined;

  const today = startOfToday();
  return parsed >= today ? localDateString(parsed) : undefined;
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function stringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map(stringValue).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  }
  if (input == null) return [];
  const value = stringValue(input);
  return value ? [value] : [];
}

function uniqueStrings(input: unknown[]): string[] {
  return Array.from(new Set(input.map(stringValue).filter(Boolean)));
}

function toSocialPlatform(input: unknown): string | undefined {
  const value = stringValue(input).toLowerCase();
  if (!value) return undefined;
  if (value.includes('linkedin')) return 'linkedin';
  if (value.includes('instagram')) return 'instagram';
  if (value.includes('facebook') || value.includes('meta')) return 'facebook';
  if (value === 'x' || value.includes('twitter')) return 'twitter';
  return undefined;
}

function normalizeSocialAdPlatform(input: unknown): string {
  return toSocialPlatform(input) || 'facebook';
}

function normalizeSocialAdCta(input: unknown): string {
  const value = stringValue(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (['learn_more', 'sign_up', 'shop_now', 'contact_us', 'download'].includes(value)) {
    return value;
  }

  if (value.includes('sign')) return 'sign_up';
  if (value.includes('shop')) return 'shop_now';
  if (value.includes('download')) return 'download';
  if (value.includes('contact') || value.includes('book') || value.includes('appointment')) return 'contact_us';
  return 'learn_more';
}

function stringValue(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (typeof input === 'number' || typeof input === 'boolean') return String(input);
  return '';
}

function joinText(parts: unknown[]): string {
  return parts.map(stringValue).filter(Boolean).join('\n\n');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'blog-outline';
}

function asRecord(input: unknown): JsonRecord {
  return isRecord(input) ? input : {};
}

function isRecord(input: unknown): input is JsonRecord {
  return !!input && typeof input === 'object' && !Array.isArray(input);
}
