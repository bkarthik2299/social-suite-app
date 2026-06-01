-- Social Suite Agentic AI foundation.
-- Creates missing Brand Guide persistence, compiled Brand Knowledge documents,
-- and approval-gated AI run tracking.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Brand Guide tables. These exist in the local schema file, but may be missing
-- from deployed projects created before the micro-tool was added.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS brand_guides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
    brand_name text,
    tagline text,
    mission text,
    vision text,
    brand_values text[] DEFAULT '{}',
    personality text[] DEFAULT '{}',
    industry text,
    target_audience text,
    elevator_pitch text,
    voice_attributes jsonb DEFAULT '[]',
    tone_spectrum jsonb DEFAULT '{}',
    writing_dos text[] DEFAULT '{}',
    writing_donts text[] DEFAULT '{}',
    preferred_terms text[] DEFAULT '{}',
    avoided_terms text[] DEFAULT '{}',
    sample_copy jsonb DEFAULT '[]',
    content_pillars text[] DEFAULT '{}',
    photography_style text,
    illustration_style text,
    iconography_rules text,
    social_rules text,
    ad_rules text,
    custom_sections jsonb DEFAULT '[]',
    logo_clearspace text,
    logo_min_digital text,
    logo_min_print text,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_guides_org ON brand_guides(org_id);
CREATE INDEX IF NOT EXISTS idx_brand_guides_project ON brand_guides(project_id);

CREATE TABLE IF NOT EXISTS brand_colors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id uuid NOT NULL REFERENCES brand_guides(id) ON DELETE CASCADE,
    name text NOT NULL,
    role text NOT NULL CHECK (role IN ('primary','secondary','accent','neutral','background')),
    hex text NOT NULL,
    rgb text,
    hsl text,
    sort_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_colors_guide ON brand_colors(guide_id);

CREATE TABLE IF NOT EXISTS brand_fonts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id uuid NOT NULL REFERENCES brand_guides(id) ON DELETE CASCADE,
    font_family text NOT NULL,
    weight text,
    category text NOT NULL CHECK (category IN ('heading','body','accent','code')),
    source_url text,
    license text,
    type_scale jsonb DEFAULT '{}',
    sort_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_fonts_guide ON brand_fonts(guide_id);

CREATE TABLE IF NOT EXISTS brand_logos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id uuid NOT NULL REFERENCES brand_guides(id) ON DELETE CASCADE,
    label text NOT NULL,
    variant text NOT NULL CHECK (variant IN ('primary','secondary','icon','monochrome','reversed')),
    file_url text NOT NULL,
    format text CHECK (format IN ('svg','png','jpg','webp')),
    dimensions text,
    sort_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_logos_guide ON brand_logos(guide_id);

CREATE TABLE IF NOT EXISTS brand_logo_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id uuid NOT NULL REFERENCES brand_guides(id) ON DELETE CASCADE,
    rule_type text NOT NULL CHECK (rule_type IN ('do','dont')),
    image_url text,
    caption text NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_logo_rules_guide ON brand_logo_rules(guide_id);

CREATE TABLE IF NOT EXISTS brand_mood_images (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id uuid NOT NULL REFERENCES brand_guides(id) ON DELETE CASCADE,
    image_url text NOT NULL,
    caption text,
    sort_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_mood_images_guide ON brand_mood_images(guide_id);

-- ---------------------------------------------------------------------------
-- Compiled Brand Knowledge
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS brand_knowledge_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    guide_id uuid NOT NULL REFERENCES brand_guides(id) ON DELETE CASCADE,
    title text NOT NULL DEFAULT 'Brand Knowledge',
    markdown text NOT NULL DEFAULT '',
    summary text,
    source_hash text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'missing' CHECK (status IN ('missing','generating','ready','stale','failed')),
    model text,
    manual_edit boolean NOT NULL DEFAULT false,
    error text,
    generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    generated_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (guide_id)
);

CREATE INDEX IF NOT EXISTS idx_brand_knowledge_documents_org ON brand_knowledge_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_brand_knowledge_documents_guide ON brand_knowledge_documents(guide_id);

CREATE TABLE IF NOT EXISTS brand_knowledge_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    guide_id uuid NOT NULL REFERENCES brand_guides(id) ON DELETE CASCADE,
    document_id uuid REFERENCES brand_knowledge_documents(id) ON DELETE CASCADE,
    source_type text NOT NULL CHECK (source_type IN ('field','website','social','logo','color','font','mood-image','manual')),
    label text,
    url text,
    platform text,
    connector text,
    extracted_text text,
    metadata jsonb NOT NULL DEFAULT '{}',
    content_hash text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','extracted','failed','skipped')),
    error text,
    extracted_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_knowledge_sources_org ON brand_knowledge_sources(org_id);
CREATE INDEX IF NOT EXISTS idx_brand_knowledge_sources_guide ON brand_knowledge_sources(guide_id);

-- ---------------------------------------------------------------------------
-- AI agents and runs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    skill_md text NOT NULL,
    tools text[] NOT NULL DEFAULT '{}',
    output_schema text,
    permissions jsonb NOT NULL DEFAULT '{}',
    is_default boolean NOT NULL DEFAULT false,
    is_enabled boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agents_org_slug ON ai_agents(COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

CREATE TABLE IF NOT EXISTS ai_agent_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    skill_md text NOT NULL,
    change_note text,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_versions_agent ON ai_agent_versions(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
    folder_id uuid REFERENCES folders(id) ON DELETE SET NULL,
    campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
    brand_guide_id uuid REFERENCES brand_guides(id) ON DELETE SET NULL,
    brand_knowledge_document_id uuid REFERENCES brand_knowledge_documents(id) ON DELETE SET NULL,
    title text NOT NULL DEFAULT 'AI Mission',
    prompt text NOT NULL,
    mode text NOT NULL DEFAULT 'approval' CHECK (mode IN ('review','approval','autopilot')),
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','needs_approval','completed','failed','canceled')),
    context jsonb NOT NULL DEFAULT '{}',
    output_summary text,
    error text,
    token_usage jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_org_created ON ai_runs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runs_status ON ai_runs(org_id, status);

CREATE TABLE IF NOT EXISTS ai_run_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
    agent_name text NOT NULL,
    title text NOT NULL,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','working','needs_approval','done','failed','skipped')),
    message text,
    sort_order integer NOT NULL DEFAULT 0,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_run_steps_run ON ai_run_steps(run_id, sort_order);

CREATE TABLE IF NOT EXISTS ai_artifacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
    type text NOT NULL,
    title text NOT NULL,
    content jsonb NOT NULL DEFAULT '{}',
    markdown text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','inserted','rejected')),
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_artifacts_run ON ai_artifacts(run_id);

CREATE TABLE IF NOT EXISTS ai_run_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
    step_id uuid REFERENCES ai_run_steps(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    message text,
    payload jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_run_events_run ON ai_run_events(run_id, created_at);

CREATE TABLE IF NOT EXISTS ai_run_approvals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
    approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    approval_type text NOT NULL DEFAULT 'create_drafts',
    status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','rejected','revoked')),
    approved_payload jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_run_approvals_run ON ai_run_approvals(run_id, created_at DESC);

-- Seed global default agents. Workspaces can clone/edit their own copies later.
INSERT INTO ai_agents (slug, name, description, skill_md, tools, output_schema, permissions, is_default)
VALUES
('planner', 'Planner Agent', 'Breaks a brief into a campaign mission plan.', '# Planner Agent

You turn a messy client brief into a clear campaign plan for Social Suite.
Define objectives, assumptions, deliverables, agent tasks, and approval gates.', ARRAY['context_reader'], 'mission_plan', '{"can_write":false}'::jsonb, true),
('brand-guide', 'Brand Guide Agent', 'Extracts and enforces brand rules from the compiled Brand Knowledge document.', '# Brand Guide Agent

Use the compiled Brand Knowledge markdown as the source of truth.
Flag missing brand facts, risky claims, forbidden terms, and tone mismatches.', ARRAY['brand_knowledge_reader'], 'brand_review', '{"can_write":false}'::jsonb, true),
('research', 'Research Agent', 'Uses approved external connectors for market and audience research.', '# Research Agent

Use allowed research connectors only.
Prefer cited, recent, relevant findings and never invent unsupported facts.', ARRAY['tavily_search','supadata_extract'], 'research_brief', '{"can_write":false}'::jsonb, true),
('copywriter', 'Copywriter Agent', 'Drafts campaign copy across formats.', '# Copywriter Agent

Write clear, brand-fit copy for social posts, paid ads, Google ads, and blog outlines.
Respect platform limits and the Brand Knowledge document.', ARRAY['content_writer'], 'campaign_copy_pack', '{"can_write":false}'::jsonb, true),
('platform-specialist', 'Platform Specialist', 'Adapts copy to platform-native formats.', '# Platform Specialist

Adapt ideas for LinkedIn, Instagram, Facebook, X, Google Search, paid social, and blogs.
Preserve the strategy while fitting each channel.', ARRAY['platform_rules'], 'platform_adaptation', '{"can_write":false}'::jsonb, true),
('qa', 'QA Agent', 'Checks completeness, constraints, and review readiness.', '# QA Agent

Check output quality, missing inputs, unsupported claims, duplicated ideas, and brand fit.
Return actionable corrections before approval.', ARRAY['schema_validator','brand_knowledge_reader'], 'qa_report', '{"can_write":false}'::jsonb, true),
('output-mapper', 'Output Mapper Agent', 'Maps generated artifacts into Social Suite draft objects.', '# Output Mapper Agent

Convert approved campaign artifacts into Social Suite structured draft objects.
Never publish, delete, send, or modify approved content.', ARRAY['content_mapper'], 'brief_to_campaign_artifact', '{"can_create_drafts":true,"can_publish":false,"can_delete":false}'::jsonb, true)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE brand_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_fonts ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_logos ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_logo_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_mood_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_run_approvals ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    brand_guides,
    brand_colors,
    brand_fonts,
    brand_logos,
    brand_logo_rules,
    brand_mood_images,
    brand_knowledge_documents,
    brand_knowledge_sources,
    ai_agents,
    ai_agent_versions,
    ai_runs,
    ai_run_steps,
    ai_artifacts,
    ai_run_events,
    ai_run_approvals
TO authenticated;

DROP POLICY IF EXISTS "Members can view brand guides" ON brand_guides;
CREATE POLICY "Members can view brand guides" ON brand_guides FOR SELECT USING (is_org_member(org_id));
DROP POLICY IF EXISTS "Editors can manage brand guides" ON brand_guides;
CREATE POLICY "Editors can manage brand guides" ON brand_guides FOR ALL USING (can_edit_org(org_id)) WITH CHECK (can_edit_org(org_id));

DROP POLICY IF EXISTS "Members can view brand colors" ON brand_colors;
CREATE POLICY "Members can view brand colors" ON brand_colors FOR SELECT USING (EXISTS (SELECT 1 FROM brand_guides bg WHERE bg.id = brand_colors.guide_id AND is_org_member(bg.org_id)));
DROP POLICY IF EXISTS "Editors can manage brand colors" ON brand_colors;
CREATE POLICY "Editors can manage brand colors" ON brand_colors FOR ALL USING (EXISTS (SELECT 1 FROM brand_guides bg WHERE bg.id = brand_colors.guide_id AND can_edit_org(bg.org_id))) WITH CHECK (EXISTS (SELECT 1 FROM brand_guides bg WHERE bg.id = brand_colors.guide_id AND can_edit_org(bg.org_id)));

DROP POLICY IF EXISTS "Members can view brand fonts" ON brand_fonts;
CREATE POLICY "Members can view brand fonts" ON brand_fonts FOR SELECT USING (EXISTS (SELECT 1 FROM brand_guides bg WHERE bg.id = brand_fonts.guide_id AND is_org_member(bg.org_id)));
DROP POLICY IF EXISTS "Editors can manage brand fonts" ON brand_fonts;
CREATE POLICY "Editors can manage brand fonts" ON brand_fonts FOR ALL USING (EXISTS (SELECT 1 FROM brand_guides bg WHERE bg.id = brand_fonts.guide_id AND can_edit_org(bg.org_id))) WITH CHECK (EXISTS (SELECT 1 FROM brand_guides bg WHERE bg.id = brand_fonts.guide_id AND can_edit_org(bg.org_id)));

DROP POLICY IF EXISTS "Members can view brand logos" ON brand_logos;
CREATE POLICY "Members can view brand logos" ON brand_logos FOR SELECT USING (EXISTS (SELECT 1 FROM brand_guides bg WHERE bg.id = brand_logos.guide_id AND is_org_member(bg.org_id)));
DROP POLICY IF EXISTS "Editors can manage brand logos" ON brand_logos;
CREATE POLICY "Editors can manage brand logos" ON brand_logos FOR ALL USING (EXISTS (SELECT 1 FROM brand_guides bg WHERE bg.id = brand_logos.guide_id AND can_edit_org(bg.org_id))) WITH CHECK (EXISTS (SELECT 1 FROM brand_guides bg WHERE bg.id = brand_logos.guide_id AND can_edit_org(bg.org_id)));

DROP POLICY IF EXISTS "Members can view brand logo rules" ON brand_logo_rules;
CREATE POLICY "Members can view brand logo rules" ON brand_logo_rules FOR SELECT USING (EXISTS (SELECT 1 FROM brand_guides bg WHERE bg.id = brand_logo_rules.guide_id AND is_org_member(bg.org_id)));
DROP POLICY IF EXISTS "Editors can manage brand logo rules" ON brand_logo_rules;
CREATE POLICY "Editors can manage brand logo rules" ON brand_logo_rules FOR ALL USING (EXISTS (SELECT 1 FROM brand_guides bg WHERE bg.id = brand_logo_rules.guide_id AND can_edit_org(bg.org_id))) WITH CHECK (EXISTS (SELECT 1 FROM brand_guides bg WHERE bg.id = brand_logo_rules.guide_id AND can_edit_org(bg.org_id)));

DROP POLICY IF EXISTS "Members can view brand mood images" ON brand_mood_images;
CREATE POLICY "Members can view brand mood images" ON brand_mood_images FOR SELECT USING (EXISTS (SELECT 1 FROM brand_guides bg WHERE bg.id = brand_mood_images.guide_id AND is_org_member(bg.org_id)));
DROP POLICY IF EXISTS "Editors can manage brand mood images" ON brand_mood_images;
CREATE POLICY "Editors can manage brand mood images" ON brand_mood_images FOR ALL USING (EXISTS (SELECT 1 FROM brand_guides bg WHERE bg.id = brand_mood_images.guide_id AND can_edit_org(bg.org_id))) WITH CHECK (EXISTS (SELECT 1 FROM brand_guides bg WHERE bg.id = brand_mood_images.guide_id AND can_edit_org(bg.org_id)));

DROP POLICY IF EXISTS "Members can view brand knowledge documents" ON brand_knowledge_documents;
CREATE POLICY "Members can view brand knowledge documents" ON brand_knowledge_documents FOR SELECT USING (is_org_member(org_id));
DROP POLICY IF EXISTS "Editors can manage brand knowledge documents" ON brand_knowledge_documents;
CREATE POLICY "Editors can manage brand knowledge documents" ON brand_knowledge_documents FOR ALL USING (can_edit_org(org_id)) WITH CHECK (can_edit_org(org_id));

DROP POLICY IF EXISTS "Members can view brand knowledge sources" ON brand_knowledge_sources;
CREATE POLICY "Members can view brand knowledge sources" ON brand_knowledge_sources FOR SELECT USING (is_org_member(org_id));
DROP POLICY IF EXISTS "Editors can manage brand knowledge sources" ON brand_knowledge_sources;
CREATE POLICY "Editors can manage brand knowledge sources" ON brand_knowledge_sources FOR ALL USING (can_edit_org(org_id)) WITH CHECK (can_edit_org(org_id));

DROP POLICY IF EXISTS "Members can view ai agents" ON ai_agents;
CREATE POLICY "Members can view ai agents" ON ai_agents FOR SELECT USING (org_id IS NULL OR is_org_member(org_id));
DROP POLICY IF EXISTS "Admins can manage workspace ai agents" ON ai_agents;
CREATE POLICY "Admins can manage workspace ai agents" ON ai_agents FOR ALL USING (org_id IS NOT NULL AND has_org_role(org_id, 'admin')) WITH CHECK (org_id IS NOT NULL AND has_org_role(org_id, 'admin'));

DROP POLICY IF EXISTS "Members can view ai agent versions" ON ai_agent_versions;
CREATE POLICY "Members can view ai agent versions" ON ai_agent_versions FOR SELECT USING (EXISTS (SELECT 1 FROM ai_agents a WHERE a.id = ai_agent_versions.agent_id AND (a.org_id IS NULL OR is_org_member(a.org_id))));
DROP POLICY IF EXISTS "Admins can manage ai agent versions" ON ai_agent_versions;
CREATE POLICY "Admins can manage ai agent versions" ON ai_agent_versions FOR ALL USING (EXISTS (SELECT 1 FROM ai_agents a WHERE a.id = ai_agent_versions.agent_id AND a.org_id IS NOT NULL AND has_org_role(a.org_id, 'admin'))) WITH CHECK (EXISTS (SELECT 1 FROM ai_agents a WHERE a.id = ai_agent_versions.agent_id AND a.org_id IS NOT NULL AND has_org_role(a.org_id, 'admin')));

DROP POLICY IF EXISTS "Members can view ai runs" ON ai_runs;
CREATE POLICY "Members can view ai runs" ON ai_runs FOR SELECT USING (is_org_member(org_id));
DROP POLICY IF EXISTS "Editors can create ai runs" ON ai_runs;
CREATE POLICY "Editors can create ai runs" ON ai_runs FOR INSERT WITH CHECK (can_edit_org(org_id));
DROP POLICY IF EXISTS "Editors can update ai runs" ON ai_runs;
CREATE POLICY "Editors can update ai runs" ON ai_runs FOR UPDATE USING (can_edit_org(org_id)) WITH CHECK (can_edit_org(org_id));

DROP POLICY IF EXISTS "Members can view ai run steps" ON ai_run_steps;
CREATE POLICY "Members can view ai run steps" ON ai_run_steps FOR SELECT USING (EXISTS (SELECT 1 FROM ai_runs r WHERE r.id = ai_run_steps.run_id AND is_org_member(r.org_id)));
DROP POLICY IF EXISTS "Editors can manage ai run steps" ON ai_run_steps;
CREATE POLICY "Editors can manage ai run steps" ON ai_run_steps FOR ALL USING (EXISTS (SELECT 1 FROM ai_runs r WHERE r.id = ai_run_steps.run_id AND can_edit_org(r.org_id))) WITH CHECK (EXISTS (SELECT 1 FROM ai_runs r WHERE r.id = ai_run_steps.run_id AND can_edit_org(r.org_id)));

DROP POLICY IF EXISTS "Members can view ai artifacts" ON ai_artifacts;
CREATE POLICY "Members can view ai artifacts" ON ai_artifacts FOR SELECT USING (EXISTS (SELECT 1 FROM ai_runs r WHERE r.id = ai_artifacts.run_id AND is_org_member(r.org_id)));
DROP POLICY IF EXISTS "Editors can manage ai artifacts" ON ai_artifacts;
CREATE POLICY "Editors can manage ai artifacts" ON ai_artifacts FOR ALL USING (EXISTS (SELECT 1 FROM ai_runs r WHERE r.id = ai_artifacts.run_id AND can_edit_org(r.org_id))) WITH CHECK (EXISTS (SELECT 1 FROM ai_runs r WHERE r.id = ai_artifacts.run_id AND can_edit_org(r.org_id)));

DROP POLICY IF EXISTS "Members can view ai run events" ON ai_run_events;
CREATE POLICY "Members can view ai run events" ON ai_run_events FOR SELECT USING (EXISTS (SELECT 1 FROM ai_runs r WHERE r.id = ai_run_events.run_id AND is_org_member(r.org_id)));
DROP POLICY IF EXISTS "Editors can manage ai run events" ON ai_run_events;
CREATE POLICY "Editors can manage ai run events" ON ai_run_events FOR ALL USING (EXISTS (SELECT 1 FROM ai_runs r WHERE r.id = ai_run_events.run_id AND can_edit_org(r.org_id))) WITH CHECK (EXISTS (SELECT 1 FROM ai_runs r WHERE r.id = ai_run_events.run_id AND can_edit_org(r.org_id)));

DROP POLICY IF EXISTS "Members can view ai run approvals" ON ai_run_approvals;
CREATE POLICY "Members can view ai run approvals" ON ai_run_approvals FOR SELECT USING (EXISTS (SELECT 1 FROM ai_runs r WHERE r.id = ai_run_approvals.run_id AND is_org_member(r.org_id)));
DROP POLICY IF EXISTS "Editors can manage ai run approvals" ON ai_run_approvals;
CREATE POLICY "Editors can manage ai run approvals" ON ai_run_approvals FOR ALL USING (EXISTS (SELECT 1 FROM ai_runs r WHERE r.id = ai_run_approvals.run_id AND can_edit_org(r.org_id))) WITH CHECK (EXISTS (SELECT 1 FROM ai_runs r WHERE r.id = ai_run_approvals.run_id AND can_edit_org(r.org_id)));

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
        DROP TRIGGER IF EXISTS set_updated_at ON brand_guides;
        CREATE TRIGGER set_updated_at BEFORE UPDATE ON brand_guides FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        DROP TRIGGER IF EXISTS set_updated_at ON brand_knowledge_documents;
        CREATE TRIGGER set_updated_at BEFORE UPDATE ON brand_knowledge_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        DROP TRIGGER IF EXISTS set_updated_at ON brand_knowledge_sources;
        CREATE TRIGGER set_updated_at BEFORE UPDATE ON brand_knowledge_sources FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        DROP TRIGGER IF EXISTS set_updated_at ON ai_agents;
        CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        DROP TRIGGER IF EXISTS set_updated_at ON ai_runs;
        CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        DROP TRIGGER IF EXISTS set_updated_at ON ai_run_steps;
        CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_run_steps FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        DROP TRIGGER IF EXISTS set_updated_at ON ai_artifacts;
        CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_artifacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;
