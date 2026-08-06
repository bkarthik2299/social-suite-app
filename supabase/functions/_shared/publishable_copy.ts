const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=(?:["'\u201c\u2018(]|\[)?[A-Z0-9])/g;
const CTA_OPENING = /^(?:please\s+)?(?:visit|learn|discover|contact|get in touch|call|book|shop|apply|find out|explore|start|speak|message|request|schedule|join|download|sign up)\b/i;

/**
 * Gives long publishable social copy a readable hook/body/CTA rhythm.
 * Existing author-supplied line breaks and short copy are deliberately preserved.
 */
export function formatPublishableCopy(value: string, minimumLength = 180): string {
  const normalized = value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  if (!normalized || normalized.length < minimumLength || normalized.includes('\n')) return normalized;

  const sentences = normalized
    .split(SENTENCE_BOUNDARY)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length < 2) return normalized;

  if (sentences.length === 2) return sentences.join('\n\n');

  const paragraphs: string[] = [sentences[0]];
  const lastSentence = sentences.at(-1) || '';
  const hasCtaEnding = CTA_OPENING.test(lastSentence);
  const bodyEnd = hasCtaEnding ? sentences.length - 1 : sentences.length;
  const body = sentences.slice(1, bodyEnd);

  if (body.length) {
    if (!hasCtaEnding && body.length >= 4) {
      const splitAt = Math.ceil(body.length / 2);
      paragraphs.push(body.slice(0, splitAt).join(' '), body.slice(splitAt).join(' '));
    } else {
      paragraphs.push(body.join(' '));
    }
  }

  if (hasCtaEnding) paragraphs.push(lastSentence);

  return paragraphs.filter(Boolean).join('\n\n');
}
