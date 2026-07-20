import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { isPostHogEnabled, posthog } from '@/lib/posthog';

const organizationEventProperties = [
  'socialsuite_organization_id',
  'socialsuite_organization_name',
  'socialsuite_organization_role',
] as const;

export default function PostHogIdentity() {
  const { user, organization, membership, isLoading } = useAuth();
  const identifiedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isPostHogEnabled || isLoading) return;

    const previousUserId = identifiedUserIdRef.current;
    if (!user) {
      if (previousUserId) posthog.reset();
      identifiedUserIdRef.current = null;
      return;
    }

    // Never let a direct account switch merge two authenticated people.
    if (previousUserId && previousUserId !== user.id) posthog.reset();

    const displayName = String(
      user.user_metadata?.full_name
      || user.user_metadata?.name
      || user.user_metadata?.display_name
      || '',
    ).trim();

    posthog.identify(user.id, {
      email: user.email,
      name: displayName || user.email,
      socialsuite_user_id: user.id,
      socialsuite_organization_id: organization?.id,
      socialsuite_organization_name: organization?.name,
      socialsuite_organization_role: membership?.role,
      socialsuite_ai_observability: true,
    });

    if (organization) {
      posthog.register({
        socialsuite_organization_id: organization.id,
        socialsuite_organization_name: organization.name,
        socialsuite_organization_role: membership?.role,
      });
      posthog.group('socialsuite_organization', organization.id, {
        name: organization.name,
        slug: organization.slug,
      });
    } else {
      organizationEventProperties.forEach((property) => posthog.unregister(property));
    }

    identifiedUserIdRef.current = user.id;
  }, [isLoading, membership?.role, organization, user]);

  return null;
}
