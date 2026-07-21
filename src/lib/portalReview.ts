type PortalSortableRecord = {
    id?: unknown;
    created_at?: unknown;
};

const sortableTime = (value: unknown): number => {
    if (typeof value !== 'string' || !value) return 0;
    return new Date(value).getTime() || 0;
};

const sortableId = (value: unknown): string => typeof value === 'string' ? value : '';

/** Keep tied review rows stable across database refreshes and status updates. */
export const sortPortalRowsByCreatedAt = <T extends PortalSortableRecord>(rows: T[]): T[] =>
    [...rows].sort((a, b) => {
        const timeDifference = sortableTime(b.created_at) - sortableTime(a.created_at);
        return timeDifference || sortableId(a.id).localeCompare(sortableId(b.id));
    });
