import { describe, expect, it } from 'vitest';
import { formatPublishableCopy } from '../../supabase/functions/_shared/publishable_copy';

describe('formatPublishableCopy', () => {
  const longCopy = 'Getting a home loan approved often feels harder when income does not arrive as a fixed monthly salary. Aptus looks at the fuller financial picture for self-employed applicants and works with the documents that reflect how their income is actually earned. That makes the application process clearer and more practical for customers with non-standard income patterns. Get in touch through aptusindia.com to find out more.';

  it('turns a long single block into readable hook, body, and CTA paragraphs', () => {
    expect(formatPublishableCopy(longCopy)).toBe([
      'Getting a home loan approved often feels harder when income does not arrive as a fixed monthly salary.',
      'Aptus looks at the fuller financial picture for self-employed applicants and works with the documents that reflect how their income is actually earned. That makes the application process clearer and more practical for customers with non-standard income patterns.',
      'Get in touch through aptusindia.com to find out more.',
    ].join('\n\n'));
  });

  it('preserves intentional formatting and short copy', () => {
    const formatted = 'A strong opening.\n\nA useful supporting paragraph.\n\nContact us to learn more.';
    expect(formatPublishableCopy(formatted)).toBe(formatted);
    expect(formatPublishableCopy('A short, useful caption.')).toBe('A short, useful caption.');
  });

  it('separates two substantial sentences into two scan-friendly paragraphs', () => {
    const twoSentenceAd = 'Your dream home should not feel out of reach because of how your income looks on paper. Aptus offers an easy financial solution for self-employed customers and families across semi-urban and rural South India who are ready to take the next step toward homeownership.';
    expect(formatPublishableCopy(twoSentenceAd)).toBe(twoSentenceAd.replace('paper. ', 'paper.\n\n'));
  });

  it('does not lose or rewrite the underlying copy while adding breaks', () => {
    expect(formatPublishableCopy(longCopy).replace(/\s+/g, ' ')).toBe(longCopy.replace(/\s+/g, ' '));
  });
});
