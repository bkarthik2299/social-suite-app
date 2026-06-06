# Social Suite - CTO Technical One-Pager

## Executive Summary
Social Suite is a multi-tenant SaaS web application for social media agency workflows: projects, folders, campaigns, content drafts, task/calendar planning, client review, brand guides, saved inspiration feeds, notes, password vaulting, and an AI "Brief to Campaign" assistant. The application is a React/Vite single-page app backed by Supabase Auth, PostgreSQL, Row Level Security, and Supabase Edge Functions for server-side AI, website research, public review links, and image generation. The architecture is pragmatic and modern: browser-facing CRUD is mostly direct-to-Supabase through typed React Query hooks, while sensitive provider integrations are kept behind Edge Functions.

## Tech Stack
- Frontend: React 18, TypeScript, Vite, React Router, TanStack React Query, Tailwind CSS, shadcn/ui/Radix UI, lucide-react, Framer Motion, BlockNote editor, dnd-kit, Recharts.
- Backend: Supabase PostgreSQL, Supabase Auth, Supabase Edge Functions running Deno, generated TypeScript DB types in `src/types/supabase.ts`.
- AI/integrations: OpenRouter for LLM orchestration, Tavily for web research, Replicate for image generation, PostHog for product analytics, social embed scripts for feed previews.
- Deployment: Vercel static SPA deployment with SPA rewrites and security headers; Supabase migrations/functions deployed separately.
- Testing/tooling: Vitest + jsdom, ESLint, TypeScript, production Vite build.

## Architecture & Runtime Flow
The app starts in `src/main.tsx`, optionally initializes PostHog, then renders `App` with React Query, auth context, toasts, tooltips, and React Router. `AuthContext` listens to Supabase auth state, loads the user's first `org_members` record, then resolves the active organization. Protected routes require both a valid user and organization. Once inside, pages use `useDatabase.ts` and `useAI.ts` hooks to query/mutate Supabase and invalidate related React Query caches.

Core navigation is: Auth -> Projects -> Folders -> Campaigns -> Campaign Dashboard. Campaign content is stored as polymorphic `content_items` with a `type` and JSONB `payload`, allowing social posts, Google ads, Meta/social ads, and blogs to share one table while preserving type-specific fields. Global views such as Tasks and Calendar aggregate across projects/campaigns. Micro tools sit beside the core workflow: Password Vault, Feed Monitor, Client Portal, Brand Guide, Social Preview, and Notes.

## Backend/Data Model
The PostgreSQL schema is organized around tenant isolation:
- Core tenancy: `organizations`, `org_members` with roles `admin`, `editor`, `viewer`.
- Content engine: `projects -> folders -> campaigns -> content_items`; `tasks` and `calendar_events` attach to orgs/campaigns.
- Micro tools: `vault_credentials`, `feed_folders`, `feed_posts`, `portal_clients`, `portal_feeds`, `portal_review_posts`, `portal_comments`, `notes`, and brand guide asset tables.
- Extensibility: `tool_registry` and `org_tools` enable modular tools per organization.
- AI layer: `brand_knowledge_documents/sources`, `ai_agents`, `ai_agent_versions`, `ai_agent_workflow_steps`, `ai_runs`, `ai_run_steps`, `ai_run_events`, `ai_artifacts`, and `ai_run_approvals`.

Row Level Security is enabled broadly. Helper functions `is_org_member`, `has_org_role`, and `can_edit_org` enforce tenant boundaries and role-based write access. New organizations auto-create an admin membership and enable default tools via trigger.

## Server-Side Functions
Supabase Edge Functions handle work that should not run in the browser:
- `ai-start-run`: authenticates the user, creates an AI run and run steps, loads destination/brand/agent context, calls OpenRouter/Tavily, and writes a campaign artifact for approval.
- `ai-commit-run`: converts an approved AI artifact into campaigns, content items, calendar rows, and approval records.
- `ai-cancel-run`: cancels active AI work.
- `brand-research-website`: researches a brand website and populates guide fields, colors, fonts, and logos.
- `brand-compile-knowledge`: compiles brand-guide data into reusable AI context.
- `generate-visual-asset`: calls Replicate to generate campaign visuals from a visual guide.
- `portal-public-review`: uses a service-role client to support tokenized public client review links without requiring client login, while validating that posts belong to the supplied token/feed.

## Security & Operational Posture
Strengths: clear Supabase RLS model, server-side provider secrets, auth-protected SPA routes, Vercel security headers, explicit warning against exposing provider keys with `VITE_`, and tenant-scoped query patterns. The public client portal is deliberately token-based and server-mediated.

Key risks/recommendations: the Password Vault currently uses browser-side AES with a browser-exposed `VITE_VAULT_ENCRYPTION_KEY`; this should move to per-user or server-assisted envelope encryption before production. The built bundle has a large main JS chunk, so code-splitting heavy pages/tools is advisable. Test coverage is currently light and focused on helpers; add integration tests for auth/RLS assumptions, AI commit paths, portal review token flows, and core CRUD. Consider rate limiting/abuse controls on public review and AI/image Edge Functions.

## How The Application Works, Briefly
An agency user signs in with Supabase Auth, creates or joins an organization, and works inside that organization's isolated workspace. They create projects, organize folders, create campaigns by channel/type, and add content drafts whose channel-specific data lives in JSONB payloads. Supporting tools enrich that workflow: brand guides define reusable voice/visual rules, feeds collect inspiration, notes capture planning, the portal sends selected work to clients for approval, and the AI assistant can turn a brief plus brand/research context into draft campaign assets. Approved AI output is committed back into normal campaigns/content/calendar tables, so AI-generated work becomes regular editable application data.

## Current Verification
Local verification on 2026-06-06: `npm.cmd test` passed 3 test files / 10 tests, and `npm.cmd run build` completed successfully. Build produced a large chunk warning for the main app bundle, which is performance-related rather than a build failure.
