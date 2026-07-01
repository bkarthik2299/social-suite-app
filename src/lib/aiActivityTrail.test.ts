import { describe, expect, it } from 'vitest';

import { activityTrailEvents, eventHandoffDetails } from './aiActivityTrail';
import type { AiRunEvent } from '@/types/ai';

function runEvent(input: Partial<AiRunEvent> & Pick<AiRunEvent, 'id' | 'event_type' | 'created_at'>): AiRunEvent {
  return {
    run_id: 'run-1',
    step_id: null,
    message: null,
    payload: {},
    ...input,
  };
}

describe('ai activity trail helpers', () => {
  it('keeps all handoff events while limiting ordinary recent activity', () => {
    const events = [
      runEvent({ id: 'planning', event_type: 'planning', created_at: '2026-07-01T10:00:00.000Z' }),
      runEvent({ id: 'planner-handoff', event_type: 'agent_handoff', created_at: '2026-07-01T10:01:00.000Z' }),
      runEvent({ id: 'model-call', event_type: 'model_call', created_at: '2026-07-01T10:02:00.000Z' }),
      runEvent({ id: 'qa-review', event_type: 'qa_review', created_at: '2026-07-01T10:03:00.000Z' }),
      runEvent({ id: 'artifact-ready', event_type: 'artifact_ready', created_at: '2026-07-01T10:04:00.000Z' }),
    ];

    const visible = activityTrailEvents(events, 2).map((event) => event.id);

    expect(visible).toEqual(['artifact-ready', 'qa-review', 'planner-handoff']);
  });

  it('parses expandable agent handoff details', () => {
    const handoff = runEvent({
      id: 'research-handoff',
      event_type: 'agent_handoff',
      created_at: '2026-07-01T10:02:00.000Z',
      message: 'Research Agent prepared a handoff for Copywriter Agent.',
      payload: {
        title: 'Research handoff',
        agentName: 'Research Agent',
        nextAgent: 'Copywriter Agent',
        summary: 'Tavily distilled 3 sources into campaign context.',
        sections: [
          { title: 'Research question', body: 'What proof points matter?' },
          { title: 'Key findings', body: ['Use local relevance.', 'Avoid unsupported claims.'] },
        ],
        metrics: {
          sourceCount: 3,
          deliverableContract: { socialPosts: 4, googleAds: 2 },
        },
        sources: [
          { title: 'Source One', url: 'https://example.com/source', score: 0.84 },
        ],
      },
    });

    const details = eventHandoffDetails(handoff);

    expect(details).toMatchObject({
      title: 'Research handoff',
      agentName: 'Research Agent',
      nextAgent: 'Copywriter Agent',
      summary: 'web research distilled 3 sources into campaign context.',
      sections: [
        { title: 'Research question', body: 'What proof points matter?' },
        { title: 'Key findings', body: ['Use local relevance.', 'Avoid unsupported claims.'] },
      ],
      sources: [{ title: 'Source One', url: 'https://example.com/source', score: 0.84 }],
    });
    expect(details?.metrics).toEqual(expect.arrayContaining([
      { label: 'Source Count', value: '3' },
      { label: 'Deliverable Contract', value: 'Social Posts: 4, Google Ads: 2' },
    ]));
  });
});
