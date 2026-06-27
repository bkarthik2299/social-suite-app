export type DeliverableContract = {
  socialPosts: number;
  googleAds: number;
  socialAds: number;
  blogOutlines: number;
  calendarItems: number;
  explicitCounts: boolean;
};

export const defaultDeliverableContract: DeliverableContract = {
  socialPosts: 12,
  googleAds: 3,
  socialAds: 4,
  blogOutlines: 2,
  calendarItems: 30,
  explicitCounts: false,
};

const deliverableLimits = {
  socialPosts: 48,
  googleAds: 20,
  socialAds: 32,
  blogOutlines: 16,
  calendarItems: 90,
} as const;

export function resolveDeliverableContract(prompt: string, modelInput: unknown, fallback: DeliverableContract) {
  const localContract = extractDeliverableContract(prompt);
  if (localContract.explicitCounts) return localContract;

  const modelContract = normalizeModelDeliverableContract(modelInput);
  if (modelContract?.explicitCounts) return modelContract;

  return fallback;
}

export function extractDeliverableContract(prompt: string): DeliverableContract {
  const text = prompt.toLowerCase().replace(/\s+/g, ' ');
  const explicit: Partial<Record<keyof Omit<DeliverableContract, 'explicitCounts'>, number>> = {};

  const socialPosts = firstCount(text, [
    `${countPrefix()}(?:organic\\s+)?(?:social(?:\\s+media)?|instagram|facebook|linkedin|x|twitter)\\s+posts?`,
    `${countPrefix()}organic\\s+posts?`,
    `${countPrefix()}posts?`,
  ]);
  if (socialPosts !== null) explicit.socialPosts = socialPosts;

  const googleAds = firstCount(text, [
    `${countPrefix()}(?:google|search)\\s+(?:search\\s+)?(?:ads?|ad\\s+groups?|ad\\s+copies?)`,
  ]);
  if (googleAds !== null) explicit.googleAds = googleAds;

  const socialAds = firstCount(text, [
    `${countPrefix()}(?:social(?:\\s+media)?|paid\\s+social|meta|facebook|instagram|linkedin)\\s+(?:ads?|ad\\s+sets?|ad\\s+copies?)`,
    `${countPrefix()}paid\\s+ads?`,
    `${countPrefix()}ads?`,
  ]);
  if (socialAds !== null) explicit.socialAds = socialAds;

  const blogOutlines = firstCount(text, [
    `${countPrefix()}(?:blog\\s+posts?|blogs?|articles?|blog\\s+outlines?)`,
  ]);
  if (blogOutlines !== null) explicit.blogOutlines = blogOutlines;

  const explicitCalendarItems = firstCount(text, [
    `${countPrefix()}(?:calendar\\s+items?|calendar\\s+touchpoints?|touchpoints?)`,
    `${countPrefix()}(?:day|days)\\s+(?:calendar|campaign\\s+calendar|content\\s+calendar)`,
  ]);
  if (explicitCalendarItems !== null) explicit.calendarItems = explicitCalendarItems;

  const explicitCounts = Object.keys(explicit).length > 0;
  if (!explicitCounts) return { ...defaultDeliverableContract };

  const contentTotal = (explicit.socialPosts || 0) + (explicit.googleAds || 0) + (explicit.socialAds || 0) + (explicit.blogOutlines || 0);
  return {
    socialPosts: clampDeliverableCount(explicit.socialPosts ?? 0, 'socialPosts'),
    googleAds: clampDeliverableCount(explicit.googleAds ?? 0, 'googleAds'),
    socialAds: clampDeliverableCount(explicit.socialAds ?? 0, 'socialAds'),
    blogOutlines: clampDeliverableCount(explicit.blogOutlines ?? 0, 'blogOutlines'),
    calendarItems: clampDeliverableCount(explicit.calendarItems ?? contentTotal, 'calendarItems'),
    explicitCounts: true,
  };
}

export function formatDeliverableContract(contract: DeliverableContract) {
  return [
    `${contract.socialPosts} social posts`,
    `${contract.googleAds} Google ads`,
    `${contract.socialAds} paid social ads`,
    `${contract.blogOutlines} blog outlines`,
    `${contract.calendarItems} calendar items`,
  ].join(', ');
}

function normalizeModelDeliverableContract(input: unknown): DeliverableContract | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const explicitCounts = record.explicitCounts === true;
  if (!explicitCounts) return null;

  const socialPosts = numberFromUnknown(record.socialPosts);
  const googleAds = numberFromUnknown(record.googleAds);
  const socialAds = numberFromUnknown(record.socialAds);
  const blogOutlines = numberFromUnknown(record.blogOutlines);
  const calendarItems = numberFromUnknown(record.calendarItems);
  if ([socialPosts, googleAds, socialAds, blogOutlines, calendarItems].some((value) => value === null)) return null;

  return {
    socialPosts: clampDeliverableCount(socialPosts, 'socialPosts'),
    googleAds: clampDeliverableCount(googleAds, 'googleAds'),
    socialAds: clampDeliverableCount(socialAds, 'socialAds'),
    blogOutlines: clampDeliverableCount(blogOutlines, 'blogOutlines'),
    calendarItems: clampDeliverableCount(calendarItems, 'calendarItems'),
    explicitCounts: true,
  };
}

function countPrefix() {
  return `${numberPattern()}\\s+(?:number\\s+of\\s+|nos?\\.?\\s+of\\s+)?`;
}

function numberPattern() {
  return '(\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';
}

function firstCount(text: string, patterns: string[]) {
  for (const pattern of patterns) {
    const match = text.match(new RegExp(pattern, 'i'));
    const count = numberFromUnknown(match?.[1]);
    if (count !== null) return count;
  }
  return null;
}

function numberFromUnknown(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) return Math.max(0, Math.floor(input));
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  if (/^\d+$/.test(value)) return Math.max(0, Number(value));
  const words: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
  };
  return value in words ? words[value] : null;
}

function clampDeliverableCount(count: number, key: keyof typeof deliverableLimits) {
  return Math.max(0, Math.min(Math.floor(count), deliverableLimits[key]));
}
