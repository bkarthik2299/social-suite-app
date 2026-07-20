import posthog from 'posthog-js';

const localHosts = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
const hasBrowser = typeof window !== 'undefined';
const isLocalPreview = hasBrowser
  && (window.location.protocol === 'file:' || localHosts.includes(window.location.hostname));
const projectToken = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;

export const isPostHogEnabled = Boolean(
  hasBrowser
  && projectToken
  && (import.meta.env.VITE_POSTHOG_ENABLE_LOCAL === 'true' || !isLocalPreview),
);

export function initializePostHog() {
  if (!isPostHogEnabled) return;

  posthog.init(projectToken, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    defaults: '2026-01-30',
    capture_pageview: 'history_change',
  });
}

export { posthog };
