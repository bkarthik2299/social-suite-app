import { createRoot } from "react-dom/client";
import { PostHogProvider } from "@posthog/react";
import { initializePostHog, isPostHogEnabled, posthog } from "@/lib/posthog";
import App from "./App.tsx";
import "./index.css";

initializePostHog();

const app = isPostHogEnabled ? (
  <PostHogProvider client={posthog}>
    <App />
  </PostHogProvider>
) : (
  <App />
);

createRoot(document.getElementById("root")!).render(app);
