import type { CampaignPack } from './campaign_pack.ts';

export function campaignTopic(prompt: string) {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  const awarenessMatch = normalized.match(/\b([a-z][a-z -]{1,60}\s+awareness)\s+campaign\b/i);
  if (awarenessMatch?.[1]) return awarenessMatch[1].replace(/^plan\s+(?:an?\s+)?/i, '').trim();

  const campaignMatch = normalized.match(/\bcampaign\s+(?:for|about|on|to promote)\s+([^.!?]+)/i);
  if (campaignMatch?.[1]) return cleanTopic(campaignMatch[1]);

  const cleaned = normalized
    .replace(/^(?:please\s+)?(?:give\s+me|create|develop|build|plan|generate)\s+/i, '')
    .replace(/^(?:a|an)\s+(?:(?:comprehensive|complete|full|360(?:-degree)?)\s+)?campaign\s+(?:to\s+)?/i, '')
    .replace(/^promote\s+/i, '');

  return cleanTopic(cleaned) || 'the subject described in the brief';
}

export function safeStrategy(prompt: string, topic = campaignTopic(prompt)): CampaignPack['strategy'] {
  const objectiveMatch = prompt.match(/\b(?:primary\s+)?objective\s+(?:is|:)\s*([^.!?]+)/i);
  const objective = objectiveMatch?.[1]?.trim().replace(/^to\s+/i, '') || `build relevant awareness and engagement around ${topic}`;
  return {
    title: `${titleCase(topic)} Campaign Strategy`,
    summary: `This campaign translates the active brief about ${topic} into a focused set of channel-ready messages. The content mix introduces the subject clearly, develops useful reasons to engage, and gives the intended audience a consistent next step without adding claims or offers that are not present in the brief. Organic content builds familiarity, paid media extends the strongest messages, and search and blog content support people who want more detail. Every asset should follow the selected project's brand guidance and remain grounded in the information supplied for this run.`,
    objectives: [
      titleCase(objective),
      `Make ${topic} clear and relevant to the intended audience`,
      'Create a consistent path from awareness to the requested next step',
    ],
    contentPillars: ['Brief context', 'Audience relevance', 'Practical value', 'Next-step engagement'],
  };
}

export function safeSocialPost(
  index: number,
  topic: string,
  platforms = ['linkedin', 'instagram', 'facebook'],
  scheduledDate?: string,
): CampaignPack['socialPosts'][number] {
  const captions = [
    `Explore ${topic} and see why it matters to the audience described in this campaign brief. Learn more through the campaign destination.`,
    `A closer look at ${topic}: clear context, practical value, and a simple way to take the next step.`,
    `The best campaigns make the subject useful and relevant. Discover the key ideas behind ${topic} and continue the conversation.`,
    `Ready to learn more about ${topic}? Review the details, share the idea with someone it may help, and follow the campaign for the next update.`,
  ];
  return {
    name: `${titleCase(topic)} Post ${index + 1}`,
    topic,
    caption: captions[index % captions.length],
    platforms,
    scheduledDate,
    creativeBrief: `Create a clear, brand-aligned visual focused on ${topic} and the audience described in the active brief.`,
    visualGuide: `Editorial campaign visual centered on ${topic}; use the active brand guide for subject, setting, palette, and tone; establish one clear focal point, generous negative space, a square or 4:5 crop, and minimal text overlay; do not introduce products, people, locations, claims, or industry cues absent from the brief.`,
  };
}

export function safeGoogleAd(index: number, topic: string, startDate?: string): CampaignPack['googleAds'][number] {
  const compactTopic = compactSearchText(titleCase(topic), 21);
  return {
    name: `${titleCase(topic)} Search Ad ${index + 1}`,
    topic,
    keywords: [topic],
    startDate,
    headlines: [
      compactSearchText(titleCase(topic), 30),
      compactSearchText(`Explore ${compactTopic}`, 30),
      compactSearchText(`Learn About ${compactTopic}`, 30),
      compactSearchText(`Discover ${compactTopic}`, 30),
      'Get Clear Information',
      'See Helpful Details',
      'Understand Your Options',
      'Take The Next Step',
      'Visit The Official Page',
      'Learn More Today',
    ],
    descriptions: [
      compactSearchText(`Explore ${compactTopic} with clear information and a simple way to continue.`, 90),
      compactSearchText(`See practical details about ${compactTopic} and decide what fits your needs.`, 90),
    ],
    callouts: ['Clear Information', 'Practical Details', 'Easy to Review', 'Learn More'],
  };
}

export function safeSocialAd(
  index: number,
  topic: string,
  platform = index % 2 === 0 ? 'instagram' : 'facebook',
  scheduledDate?: string,
): CampaignPack['socialAds'][number] {
  return {
    name: `${titleCase(topic)} Social Ad ${index + 1}`,
    topic,
    platform,
    scheduledDate,
    primaryText: `Discover ${topic} through a message built around the audience and objective in this campaign brief. Explore the details and take the next step when you are ready.`,
    headline: `Explore ${titleCase(topic)}`,
    description: 'Clear, relevant information from the active campaign brief.',
    visualGuide: `Paid social visual centered on ${topic}; follow the active brand guide for palette and tone, use one clear focal subject and a simple composition with room for an optional short headline, and avoid any product, person, place, claim, or industry cue not supplied in the brief.`,
    cta: 'learn_more',
  };
}

export function safeBlogOutline(index: number, topic: string, publishDate?: string): CampaignPack['blogOutlines'][number] {
  const title = index === 0 ? `Understanding ${titleCase(topic)}` : `${titleCase(topic)}: A Practical Guide`;
  return {
    title,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    excerpt: `A brief-aligned guide to ${topic}, why it matters to the intended audience, and what to consider next.`,
    metaTitle: title,
    metaDescription: `Explore the key ideas behind ${topic} with clear context grounded in the active campaign brief.`,
    keywords: topic.split(/\s+/).filter((word) => word.length > 2).slice(0, 8),
    outline: ['Context from the campaign brief', 'Why the subject matters', 'Key ideas to understand', 'Practical considerations', 'The campaign next step'],
    publishDate,
  };
}

export function safeCalendarItem(index: number, topic: string): CampaignPack['calendar'][number] {
  const date = new Date();
  date.setDate(date.getDate() + index + 1);
  const type = index % 7 === 0 ? 'blogs' : index % 4 === 0 ? 'meta-ad' : index % 5 === 0 ? 'google-ad' : 'socials';
  const format = type === 'blogs' ? 'Article' : type === 'google-ad' ? 'Search Ad' : type === 'meta-ad' ? 'Paid Social' : 'Organic Post';
  return {
    title: `${titleCase(topic)} ${format} ${index + 1}`,
    type,
    date: date.toISOString().slice(0, 10),
  };
}

function cleanTopic(value: string) {
  const cleaned = value
    .replace(/\b(?:give|include|deliver|create|generate)\s+(?:me\s+)?\d+\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:,-]+|[\s:,-]+$/g, '')
    .trim();
  if (cleaned.length <= 120) return cleaned;
  return `${cleaned.slice(0, 117).replace(/\s+\S*$/, '').trim()}...`;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function compactSearchText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const clipped = normalized.slice(0, maxLength + 1);
  const wordBoundary = clipped.lastIndexOf(' ');
  return (wordBoundary >= Math.floor(maxLength * 0.55) ? clipped.slice(0, wordBoundary) : clipped.slice(0, maxLength))
    .replace(/[\s,;:|/\\-]+$/g, '')
    .trim();
}
