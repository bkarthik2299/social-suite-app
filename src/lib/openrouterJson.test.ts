import { describe, expect, it } from 'vitest';

import { parseJsonContent } from '../../supabase/functions/_shared/json';

describe('parseJsonContent', () => {
  it('extracts valid JSON from fenced model responses', () => {
    expect(parseJsonContent('```json\n{"answer":"ok","sources":[]}\n```')).toEqual({
      answer: 'ok',
      sources: [],
    });
  });

  it('recovers the first balanced JSON object from prose', () => {
    expect(parseJsonContent('Here is the result:\n{"socialPosts":[{"caption":"Ready"}]}\nHope this helps.')).toEqual({
      socialPosts: [{ caption: 'Ready' }],
    });
  });

  it('repairs common trailing commas before parsing', () => {
    expect(parseJsonContent('{"calendar":[{"title":"Launch","date":"2026-07-10",},],}')).toEqual({
      calendar: [{ title: 'Launch', date: '2026-07-10' }],
    });
  });
});
