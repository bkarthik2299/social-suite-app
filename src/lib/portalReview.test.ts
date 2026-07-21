import { describe, expect, it } from 'vitest';
import { sortPortalRowsByCreatedAt } from './portalReview';

describe('sortPortalRowsByCreatedAt', () => {
    it('keeps posts with matching creation times in a deterministic order', () => {
        const createdAt = '2026-07-21T08:00:00.000Z';
        const firstResult = sortPortalRowsByCreatedAt([
            { id: 'post-c', created_at: createdAt },
            { id: 'post-a', created_at: createdAt },
            { id: 'post-b', created_at: createdAt },
        ]);
        const refreshedResult = sortPortalRowsByCreatedAt([
            { id: 'post-b', created_at: createdAt, status: 'approved' },
            { id: 'post-c', created_at: createdAt },
            { id: 'post-a', created_at: createdAt },
        ]);

        expect(firstResult.map(post => post.id)).toEqual(['post-a', 'post-b', 'post-c']);
        expect(refreshedResult.map(post => post.id)).toEqual(['post-a', 'post-b', 'post-c']);
    });

    it('still places newer posts before older posts', () => {
        const result = sortPortalRowsByCreatedAt([
            { id: 'older', created_at: '2026-07-20T08:00:00.000Z' },
            { id: 'newer', created_at: '2026-07-21T08:00:00.000Z' },
        ]);

        expect(result.map(post => post.id)).toEqual(['newer', 'older']);
    });
});
