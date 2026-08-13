export type VisualSlidePlan = {
  count: number;
  isCarousel: boolean;
  prompts: string[];
};

const NUMBER_WORDS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const clampSlideCount = (value: number) => Math.max(2, Math.min(10, value));

export const inferVisualSlidePlan = (visualGuide: string): VisualSlidePlan => {
  const guide = visualGuide.trim();
  const documentMentioned = /\b(linkedin\s+document(?:\s+post)?|document[- ]style(?:\s+(?:post|social asset))?|multi[- ]?page)\b/i.test(guide)
    || /\bpage\s*\d{1,2}\s*[:.\-–—]/i.test(guide)
    || /\b(?:\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)\s+pages\b/i.test(guide);
  const carouselMentioned = documentMentioned || /\b(carousel|multi[- ]?slide|slide deck|slides?)\b/i.test(guide);

  if (!carouselMentioned) {
    return { count: 1, isCarousel: false, prompts: [guide] };
  }

  const numberedSlideMatches = Array.from(guide.matchAll(/\b(?:slide|page)\s*(\d{1,2})\s*[:.\-–—]/gi));
  const highestNumberedSlide = numberedSlideMatches.reduce((highest, match) => (
    Math.max(highest, Number(match[1]) || 0)
  ), 0);
  const numericCount = guide.match(/\b(\d{1,2})\s*(?:[- ]?(?:slide|page)|slides\b|pages\b)/i);
  const wordCount = guide.match(/\b(two|three|four|five|six|seven|eight|nine|ten)\s*(?:[- ]?(?:slide|page)|slides\b|pages\b)/i);
  const structuredDocumentCount = documentMentioned ? inferStructuredDocumentCount(guide) : 0;
  const detectedCount = highestNumberedSlide
    || Number(numericCount?.[1] || 0)
    || NUMBER_WORDS[wordCount?.[1]?.toLowerCase() || '']
    || structuredDocumentCount
    || 4;
  const count = clampSlideCount(detectedCount);

  return {
    count,
    isCarousel: true,
    prompts: Array.from({ length: count }, (_, index) => buildSlidePrompt(guide, index + 1, count, documentMentioned)),
  };
};

const inferStructuredDocumentCount = (visualGuide: string) => {
  const innerCountMatch = visualGuide.match(/\b(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)\s+inner\s+(?:cards?|pages?)\b/i);
  const innerCountToken = innerCountMatch?.[1]?.toLowerCase() || '';
  const innerCount = Number(innerCountToken) || NUMBER_WORDS[innerCountToken] || 0;
  const coverCount = /\bcover(?:\s+page)?\b/i.test(visualGuide) ? 1 : 0;
  const closingCount = /\b(?:closing|final|cta)\s+page\b/i.test(visualGuide) ? 1 : 0;
  return innerCount > 0 ? coverCount + innerCount + closingCount : 0;
};

const buildSlidePrompt = (visualGuide: string, slideNumber: number, slideCount: number, documentMentioned: boolean) => {
  const unit = documentMentioned ? 'page' : 'slide';
  const explicitDirection = extractSlideDirection(visualGuide, slideNumber);
  const structuredDirection = documentMentioned
    ? inferStructuredPageDirection(visualGuide, slideNumber, slideCount)
    : '';

  return [
    `Source brief for the complete ${slideCount}-${unit} campaign: ${visualGuide}`,
    `Render only ${unit} ${slideNumber} of ${slideCount} as one complete, standalone, full-canvas image.`,
    explicitDirection ? `Direction for this ${unit}: ${explicitDirection}` : '',
    !explicitDirection && structuredDirection ? `Direction for this ${unit}: ${structuredDirection}` : '',
    `Keep a coherent campaign system across all ${slideCount} ${unit}s, but make this ${unit} visually complete on its own.`,
    `The output must contain exactly one ${unit} filling the entire canvas edge to edge.`,
    `Never show multiple ${unit}s, panels, frames, contact sheets, grids, mockups, thumbnails, or page previews inside this image.`,
  ].filter(Boolean).join('\n');
};

const inferStructuredPageDirection = (visualGuide: string, pageNumber: number, pageCount: number) => {
  if (pageNumber === 1 && /\bcover(?:\s+page)?\b/i.test(visualGuide)) {
    return 'Create the cover page with the campaign hook and a strong single focal point.';
  }
  if (pageNumber === pageCount && /\b(?:closing|final|cta)\s+page\b/i.test(visualGuide)) {
    return 'Create the closing page; place the brief’s CTA details here and keep the ending decisive.';
  }
  if (/\binner\s+(?:cards?|pages?)\b/i.test(visualGuide)) {
    return `Create inner content page ${pageNumber - 1} of ${Math.max(1, pageCount - 2)} with one focused supporting idea.`;
  }
  return '';
};

const extractSlideDirection = (visualGuide: string, slideNumber: number) => {
  const marker = new RegExp(`\\b(?:slide|page)\\s*${slideNumber}\\s*[:.\\-–—]\\s*`, 'i');
  const match = marker.exec(visualGuide);
  if (!match) return '';

  const remainder = visualGuide.slice(match.index + match[0].length);
  const nextMarker = remainder.search(/\b(?:slide|page)\s*\d{1,2}\s*[:.\-–—]/i);
  return (nextMarker >= 0 ? remainder.slice(0, nextMarker) : remainder).trim().slice(0, 700);
};

export type LogoPlacement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center' | 'center';

export const inferLogoPlacement = (visualGuide: string): LogoPlacement => {
  const guide = visualGuide.toLowerCase();
  const placements: Array<[RegExp, LogoPlacement]> = [
    [/\b(top|upper)[ -]left\b|\bleft[ -](top|upper)\b/, 'top-left'],
    [/\b(top|upper)[ -]right\b|\bright[ -](top|upper)\b/, 'top-right'],
    [/\b(bottom|lower)[ -]left\b|\bleft[ -](bottom|lower)\b/, 'bottom-left'],
    [/\b(bottom|lower)[ -]right\b|\bright[ -](bottom|lower)\b/, 'bottom-right'],
    [/\b(top|upper)[ -](center|centre|middle)\b/, 'top-center'],
    [/\b(bottom|lower)[ -](center|centre|middle)\b/, 'bottom-center'],
    [/\b(center|centre|middle)(?:ed)?\b/, 'center'],
  ];

  return placements.find(([pattern]) => pattern.test(guide))?.[1] || 'bottom-right';
};
