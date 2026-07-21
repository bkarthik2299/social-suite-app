export const ONBOARDING_VERSION = 1;

export type OnboardingVisitId =
  | 'notes'
  | 'reference-feed'
  | 'client-portal'
  | 'social-preview'
  | 'password-vault'
  | 'teams';

type SchedulableContent = {
  payload?: Record<string, unknown> | null;
};

const scheduledDateKeys = [
  'scheduledDate',
  'scheduled_date',
  'startDate',
  'start_date',
  'publishDate',
  'publish_date',
] as const;

export function hasScheduledContent(items: SchedulableContent[]): boolean {
  return items.some((item) => scheduledDateKeys.some((key) => {
    const value = item.payload?.[key];
    return (typeof value === 'string' && value.trim().length > 0) || typeof value === 'number';
  }));
}

export function onboardingStorageKey(
  kind: 'seen' | 'visited',
  userId: string,
  organizationId: string,
): string {
  return `socialsuite.onboarding.v${ONBOARDING_VERSION}.${kind}.${userId}.${organizationId}`;
}
