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
4. **Extensibility**: `tool_registry`, `org_tools` (for adding new micro tools automatically without schema migrations).

## Getting Started

### Prerequisites

Ensure you have Node.js and a valid `npm` environment installed.

### Installation

1. Install all dependencies:
```bash
npm install
```

2. Setup your local Environment Variables. Note that API keys for Supabase exist in `src/lib/supabase.ts`. In a production setting, these should be placed into `.env`.

### Running Locally

To start the Vite development server:
```bash
npm run dev
```
Navigate to `http://localhost:8080` (or whichever port Vite allocates) to view the application.

## Deployment & Setup

The database schema, triggers, and Row Level Security policies have been provided in `supabase_schema.sql` and deployed to the `socialsuite-db` Supabase project.

This ensures proper tenant isolation (using `org_id` restrictions across the board) and sets a solid foundation for adding additional micro tools or campaign item subtypes later via the JSONB `content_items` mapping.
