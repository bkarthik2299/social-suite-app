import { createRoot } from "react-dom/client";
import { PostHogProvider } from "@posthog/react";
import posthog from "posthog-js";
import App from "./App.tsx";
import "./index.css";

const localHosts = ["localhost", "127.0.0.1", "::1", "0.0.0.0"];
const isLocalPreview =
  window.location.protocol === "file:" || localHosts.includes(window.location.hostname);
const posthogProjectToken = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
const posthogHost = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";
const shouldEnablePostHog =
  Boolean(posthogProjectToken) &&
  (import.meta.env.VITE_POSTHOG_ENABLE_LOCAL === "true" || !isLocalPreview);

if (shouldEnablePostHog) {
  posthog.init(posthogProjectToken, {
    api_host: posthogHost,
    defaults: "2026-01-30",
    capture_pageview: "history_change",
  });
}

const app = shouldEnablePostHog ? (
  <PostHogProvider client={posthog}>
    <App />
  </PostHogProvider>
) : (
  <App />
);

createRoot(document.getElementById("root")!).render(app);
