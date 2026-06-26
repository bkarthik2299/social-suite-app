# Social Suite

A comprehensive SaaS platform designed to manage social media portfolios, integrate with micro tools, and provide an all-in-one suite for agency workflows.

## Architecture

The project has recently migrated from an in-memory/IndexedDB client-side application to a robust full-stack architecture leveraging:

- **Frontend**: Vite, React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend/DB**: Supabase (PostgreSQL)
- **State/Data Fetching**: React Query (`@tanstack/react-query`)
- **Authentication**: Supabase Auth (with Organization-based access control Row Level Security - RLS)

### Database Structure

The database scales vertically with a modular architecture:

1. **Core / Global**: `organizations`, `org_members`
2. **Content Engine**: `projects` → `folders` → `campaigns` → `content_items` (Polymorphic JSONB architecture).
3. **Micro Tools**:
   - `vault_credentials` (Password Vault)
   - `feed_folders`, `feed_posts` (Feed Monitor)
   - `portal_clients`, `portal_feeds`, `portal_review_posts` (Client Portal)
   - `brand_guides`, `brand_knowledge_documents` (Brand Guide + compiled AI context)
4. **Extensibility**: `tool_registry`, `org_tools` (for adding new micro tools automatically without schema migrations).
5. **Agentic AI Layer**: `ai_agents`, `ai_runs`, `ai_run_steps`, `ai_artifacts`, and `ai_run_approvals` power approval-gated Brief to Campaign missions.

## Getting Started

### Prerequisites

Ensure you have Node.js and a valid `npm` environment installed.

### Installation

1. Install all dependencies:
```bash
npm install
```

2. Set up local environment variables:
```bash
cp .env.example .env.local
```

Only `VITE_*` values are browser-exposed. Provider keys such as OpenRouter, Tavily, Supadata, and Trigger must stay in Supabase Edge Function secrets, never in Vercel public environment variables.

### Running Locally

To start the Vite development server:
```bash
npm run dev
```
Navigate to `http://localhost:8080` (or whichever port Vite allocates) to view the application.

## Deployment & Setup

Database schema changes live in `supabase/migrations`. Deploy migrations to Supabase before deploying AI Edge Functions.

This ensures proper tenant isolation (using `org_id` restrictions across the board) and sets a solid foundation for adding additional micro tools or campaign item subtypes later via the JSONB `content_items` mapping.

### Vercel Environment Variables

Set these in Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_ENV=production`
- `VITE_VAULT_ENCRYPTION_KEY` only if the current Password Vault remains enabled

Do not set AI/provider/server secrets with a `VITE_` prefix. The vault key is browser-exposed and should be treated as a temporary compatibility setting, not a true server secret.

### Supabase Edge Function Secrets

Set these in the Supabase dashboard or with `supabase secrets set`:

- `OPENROUTER_API_KEY`
- `TAVILY_API_KEY`
- `SUPADATA_API_KEY`
- `FIRECRAWL_API_KEY`
- `TRIGGER_SECRET_KEY` (reserved for the durable workflow phase)
- `AI_DEFAULT_MODEL`
- `AI_FAST_MODEL`

Mission Mode now uses explicit user-selected models. Defaults are `deepseek/deepseek-v4-flash` for Instant, `deepseek/deepseek-v4-pro` for Deep Work, and Tavily for research. Perplexity research uses `perplexity/sonar-pro` through OpenRouter.

Supabase provides `SUPABASE_URL` and project API keys to Edge Functions. This code supports both the legacy `SUPABASE_ANON_KEY` secret and the newer `SUPABASE_PUBLISHABLE_KEYS` secret shape.
