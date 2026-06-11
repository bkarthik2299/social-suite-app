-- ==========================================================================
-- SOCIAL SUITE — Complete Database Schema
-- Run this in your Supabase SQL Editor (supabase.com/dashboard → SQL Editor)
-- ==========================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================================================
-- LAYER 1: CORE — Organizations & Team Members
-- ==========================================================================

CREATE TABLE organizations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    slug        text UNIQUE NOT NULL,
    created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    settings    jsonb DEFAULT '{}',
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

CREATE TABLE org_members (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role        text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
    joined_at   timestamptz DEFAULT now(),
    UNIQUE(org_id, user_id)
);

-- Index for fast org lookups by user
CREATE INDEX idx_org_members_user ON org_members(user_id);
CREATE INDEX idx_org_members_org ON org_members(org_id);
CREATE INDEX idx_organizations_created_by ON organizations(created_by);

-- ==========================================================================
-- LAYER 2: CONTENT ENGINE — Projects → Folders → Campaigns → Content
-- ==========================================================================

-- Projects
CREATE TABLE projects (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name        text NOT NULL,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_projects_org ON projects(org_id);

-- Folders
CREATE TABLE folders (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        text NOT NULL,
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_folders_project ON folders(project_id);

-- Campaigns
CREATE TABLE campaigns (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id   uuid NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    name        text NOT NULL,
    type        text NOT NULL CHECK (type IN ('socials', 'google-ad', 'meta-ad', 'blogs')),
    deadline    date,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_campaigns_folder ON campaigns(folder_id);
CREATE INDEX idx_campaigns_type ON campaigns(folder_id, type);

-- Content Items (Polymorphic — single table for all content types)
CREATE TABLE content_items (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    type        text NOT NULL CHECK (type IN ('social-post', 'google-ad', 'social-ad', 'blog')),
    name        text,
    status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'active', 'paused', 'archived')),
    payload     jsonb NOT NULL DEFAULT '{}',
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_content_items_campaign ON content_items(campaign_id);
CREATE INDEX idx_content_items_campaign_type ON content_items(campaign_id, type);
CREATE INDEX idx_content_items_payload ON content_items USING GIN(payload);

-- Full-text search column (auto-generated from name + payload text fields)
ALTER TABLE content_items ADD COLUMN fts tsvector
    GENERATED ALWAYS AS (
        to_tsvector('english',
            coalesce(name, '') || ' ' ||
            coalesce(payload->>'caption', '') || ' ' ||
            coalesce(payload->>'content', '') || ' ' ||
            coalesce(payload->>'headline', '') || ' ' ||
            coalesce(payload->>'primary_text', '')
        )
    ) STORED;

CREATE INDEX idx_content_items_fts ON content_items USING GIN(fts);

-- Tasks
CREATE TABLE tasks (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id  uuid REFERENCES projects(id) ON DELETE SET NULL,
    campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
    assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    title       text NOT NULL,
    description text,
    status      text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in-progress', 'done')),
    due_date    date,
    sort_order  integer DEFAULT 0,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_tasks_org_status ON tasks(org_id, status);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_campaign ON tasks(campaign_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);

-- Calendar Events
CREATE TABLE calendar_events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    title       text NOT NULL,
    event_date  date NOT NULL,
    type        text NOT NULL CHECK (type IN ('socials', 'google-ad', 'meta-ad', 'blogs')),
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_calendar_events_campaign ON calendar_events(campaign_id);
CREATE INDEX idx_calendar_events_date ON calendar_events(event_date);

-- ==========================================================================
-- LAYER 3a: MICRO TOOL — Password Vault
-- ==========================================================================

CREATE TABLE vault_credentials (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
    service_name    text NOT NULL,
    username        text NOT NULL,
    encrypted_password text NOT NULL,
    url             text,
    category        text,
    color_class     text,
    created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_vault_org ON vault_credentials(org_id);
CREATE INDEX idx_vault_org_project ON vault_credentials(org_id, project_id);

-- ==========================================================================
-- LAYER 3b: MICRO TOOL — Feed Monitor
-- ==========================================================================

CREATE TABLE feed_folders (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name        text NOT NULL,
    description text,
    color       text,
    created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_feed_folders_org ON feed_folders(org_id);

CREATE TABLE feed_posts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    folder_id       uuid REFERENCES feed_folders(id) ON DELETE SET NULL,
    platform        text NOT NULL CHECK (platform IN ('facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube')),
    url             text NOT NULL,
    og_title        text,
    og_description  text,
    og_image        text,
    og_site_name    text,
    content         text,
    created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_feed_posts_org ON feed_posts(org_id);
CREATE INDEX idx_feed_posts_org_platform ON feed_posts(org_id, platform);
CREATE INDEX idx_feed_posts_folder ON feed_posts(folder_id);

-- ==========================================================================
-- LAYER 3c: MICRO TOOL — Client Portal
-- ==========================================================================

CREATE TABLE portal_clients (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            text NOT NULL,
    company         text,
    logo            text,
    access_token    text UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_portal_clients_org ON portal_clients(org_id);
CREATE INDEX idx_portal_clients_token ON portal_clients(access_token);

CREATE TABLE portal_feeds (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   uuid NOT NULL REFERENCES portal_clients(id) ON DELETE CASCADE,
    name        text NOT NULL,
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_portal_feeds_client ON portal_feeds(client_id);

CREATE TABLE portal_review_posts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_id         uuid NOT NULL REFERENCES portal_feeds(id) ON DELETE CASCADE,
    content_item_id uuid REFERENCES content_items(id) ON DELETE SET NULL,
    content_type    text NOT NULL CHECK (content_type IN ('social-post', 'google-ad', 'social-ad', 'blog', 'campaign')),
    status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested')),
    snapshot        jsonb NOT NULL DEFAULT '{}',
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_portal_review_posts_feed ON portal_review_posts(feed_id);
CREATE INDEX idx_portal_review_posts_status ON portal_review_posts(feed_id, status);

CREATE TABLE portal_comments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     uuid NOT NULL REFERENCES portal_review_posts(id) ON DELETE CASCADE,
    author      text NOT NULL,
    text        text NOT NULL,
    avatar      text,
    is_client   boolean DEFAULT false,
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_portal_comments_post ON portal_comments(post_id);

-- ==========================================================================
-- LAYER 3d: MICRO TOOL — Notes
-- ==========================================================================

CREATE TABLE notes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id  uuid REFERENCES projects(id) ON DELETE SET NULL,
    title       text NOT NULL DEFAULT 'Untitled Note',
    content     jsonb NOT NULL DEFAULT '[]',
    created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_notes_org ON notes(org_id);
CREATE INDEX idx_notes_project ON notes(project_id);

-- ==========================================================================
-- LAYER 3e: MICRO TOOL - Brand Guide
-- ==========================================================================

CREATE TABLE brand_guides (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id  uuid REFERENCES projects(id) ON DELETE SET NULL,

    -- Section: Brand Identity
    brand_name      text,
    tagline         text,
    mission         text,
    vision          text,
    brand_values    text[] DEFAULT '{}',
    personality     text[] DEFAULT '{}',
    industry        text,
    target_audience text,
    elevator_pitch  text,

    -- Section: Voice and Tone
    voice_attributes    jsonb DEFAULT '[]',
    tone_spectrum       jsonb DEFAULT '{}',
    writing_dos         text[] DEFAULT '{}',
    writing_donts       text[] DEFAULT '{}',
    preferred_terms     text[] DEFAULT '{}',
    avoided_terms       text[] DEFAULT '{}',
    sample_copy         jsonb DEFAULT '[]',
    content_pillars     text[] DEFAULT '{}',

    -- Section: Imagery
    photography_style   text,
    illustration_style  text,
    iconography_rules   text,

    -- Section: Application Rules
    social_rules    text,
    ad_rules        text,
    custom_sections jsonb DEFAULT '[]',

    -- Section: Logo Rules
    logo_clearspace   text,
    logo_min_digital text,
    logo_min_print   text,

    created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_brand_guides_org ON brand_guides(org_id);
CREATE INDEX idx_brand_guides_project ON brand_guides(project_id);

CREATE TABLE brand_colors (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id    uuid NOT NULL REFERENCES brand_guides(id) ON DELETE CASCADE,
    name        text NOT NULL,
    role        text NOT NULL CHECK (role IN ('primary','secondary','accent','neutral','background')),
    hex         text NOT NULL,
    rgb         text,
    hsl         text,
    sort_order  integer DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_brand_colors_guide ON brand_colors(guide_id);

CREATE TABLE brand_fonts (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id    uuid NOT NULL REFERENCES brand_guides(id) ON DELETE CASCADE,
    font_family text NOT NULL,
    weight      text,
    category    text NOT NULL CHECK (category IN ('heading','body','accent','code')),
    source_url  text,
    license     text,
    type_scale  jsonb DEFAULT '{}',
    sort_order  integer DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_brand_fonts_guide ON brand_fonts(guide_id);

CREATE TABLE brand_logos (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id    uuid NOT NULL REFERENCES brand_guides(id) ON DELETE CASCADE,
    label       text NOT NULL,
    variant     text NOT NULL CHECK (variant IN ('primary','secondary','icon','monochrome','reversed')),
    file_url    text NOT NULL,
    format      text CHECK (format IN ('svg','png','jpg','webp')),
    dimensions  text,
    sort_order  integer DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_brand_logos_guide ON brand_logos(guide_id);

CREATE TABLE brand_logo_rules (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id    uuid NOT NULL REFERENCES brand_guides(id) ON DELETE CASCADE,
    rule_type   text NOT NULL CHECK (rule_type IN ('do','dont')),
    image_url   text,
    caption     text NOT NULL,
    sort_order  integer DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_brand_logo_rules_guide ON brand_logo_rules(guide_id);

CREATE TABLE brand_mood_images (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id    uuid NOT NULL REFERENCES brand_guides(id) ON DELETE CASCADE,
    image_url   text NOT NULL,
    caption     text,
    sort_order  integer DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_brand_mood_images_guide ON brand_mood_images(guide_id);

-- ==========================================================================
-- LAYER 4: PLUGIN REGISTRY — For Future Micro Tools
-- ==========================================================================

CREATE TABLE tool_registry (
    id          text PRIMARY KEY,
    name        text NOT NULL,
    description text,
    icon        text,
    is_active   boolean DEFAULT true,
    created_at  timestamptz DEFAULT now()
);

CREATE TABLE org_tools (
    org_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
    tool_id     text REFERENCES tool_registry(id) ON DELETE CASCADE,
    enabled     boolean DEFAULT true,
    settings    jsonb DEFAULT '{}',
    PRIMARY KEY (org_id, tool_id)
);

-- Seed default tools
INSERT INTO tool_registry (id, name, description, icon) VALUES
    ('vault',           'Password Vault',   'Securely store and manage credentials for client accounts', 'shield'),
    ('feed-monitor',    'Feed Monitor',     'Save and organize social media posts for inspiration',       'rss'),
    ('client-portal',   'Client Portal',    'Share work with clients for review and approval',            'users'),
    ('social-preview',  'Social Preview',   'Preview creative assets across platform formats',            'eye'),
    ('notes',           'Notes',            'Minimal Notion-like note taking tool',                       'file-text'),
    ('brand-guide',     'Brand Guide',      'Manage brand identity, colors, typography, voice and tone per project', 'palette');

-- ==========================================================================
-- ROW LEVEL SECURITY (RLS)
-- ==========================================================================

-- Helper function: check if current user is a member of the given org
CREATE OR REPLACE FUNCTION is_org_member(check_org_id uuid)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM org_members
        WHERE org_id = check_org_id AND user_id = auth.uid()
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if current user has a specific role in the org
CREATE OR REPLACE FUNCTION has_org_role(check_org_id uuid, required_role text)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM org_members
        WHERE org_id = check_org_id
          AND user_id = auth.uid()
          AND role = required_role
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if current user is admin or editor
CREATE OR REPLACE FUNCTION can_edit_org(check_org_id uuid)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM org_members
        WHERE org_id = check_org_id
          AND user_id = auth.uid()
          AND role IN ('admin', 'editor')
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---- ORGANIZATIONS ----
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their org"
    ON organizations FOR SELECT
    USING (is_org_member(id) OR created_by = (select auth.uid()));

CREATE POLICY "Admins can update their org"
    ON organizations FOR UPDATE
    USING (has_org_role(id, 'admin'));

-- Allow any authenticated user to create an org (they become admin via trigger)
CREATE POLICY "Authenticated users can create orgs"
    ON organizations FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.uid()) IS NOT NULL AND created_by = (select auth.uid()));

-- ---- ORG_MEMBERS ----
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view fellow members"
    ON org_members FOR SELECT
    USING (is_org_member(org_id));

CREATE POLICY "Admins can manage members"
    ON org_members FOR ALL
    USING (has_org_role(org_id, 'admin'));

-- ---- PROJECTS ----
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view projects"
    ON projects FOR SELECT
    USING (is_org_member(org_id));

CREATE POLICY "Editors can manage projects"
    ON projects FOR INSERT
    WITH CHECK (can_edit_org(org_id));

CREATE POLICY "Editors can update projects"
    ON projects FOR UPDATE
    USING (can_edit_org(org_id));

CREATE POLICY "Admins can delete projects"
    ON projects FOR DELETE
    USING (has_org_role(org_id, 'admin'));

-- ---- FOLDERS ----
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view folders"
    ON folders FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM projects p WHERE p.id = folders.project_id AND is_org_member(p.org_id)
    ));

CREATE POLICY "Editors can manage folders"
    ON folders FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM projects p WHERE p.id = folders.project_id AND can_edit_org(p.org_id)
    ));

CREATE POLICY "Editors can update folders"
    ON folders FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM projects p WHERE p.id = folders.project_id AND can_edit_org(p.org_id)
    ));

CREATE POLICY "Editors can delete folders"
    ON folders FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM projects p WHERE p.id = folders.project_id AND can_edit_org(p.org_id)
    ));

-- ---- CAMPAIGNS ----
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view campaigns"
    ON campaigns FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM folders f
        JOIN projects p ON p.id = f.project_id
        WHERE f.id = campaigns.folder_id AND is_org_member(p.org_id)
    ));

CREATE POLICY "Editors can manage campaigns"
    ON campaigns FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM folders f
        JOIN projects p ON p.id = f.project_id
        WHERE f.id = campaigns.folder_id AND can_edit_org(p.org_id)
    ));

CREATE POLICY "Editors can update campaigns"
    ON campaigns FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM folders f
        JOIN projects p ON p.id = f.project_id
        WHERE f.id = campaigns.folder_id AND can_edit_org(p.org_id)
    ));

CREATE POLICY "Editors can delete campaigns"
    ON campaigns FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM folders f
        JOIN projects p ON p.id = f.project_id
        WHERE f.id = campaigns.folder_id AND can_edit_org(p.org_id)
    ));

-- ---- CONTENT_ITEMS ----
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view content"
    ON content_items FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM campaigns c
        JOIN folders f ON f.id = c.folder_id
        JOIN projects p ON p.id = f.project_id
        WHERE c.id = content_items.campaign_id AND is_org_member(p.org_id)
    ));

CREATE POLICY "Editors can manage content"
    ON content_items FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM campaigns c
        JOIN folders f ON f.id = c.folder_id
        JOIN projects p ON p.id = f.project_id
        WHERE c.id = content_items.campaign_id AND can_edit_org(p.org_id)
    ));

CREATE POLICY "Editors can update content"
    ON content_items FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM campaigns c
        JOIN folders f ON f.id = c.folder_id
        JOIN projects p ON p.id = f.project_id
        WHERE c.id = content_items.campaign_id AND can_edit_org(p.org_id)
    ));

CREATE POLICY "Editors can delete content"
    ON content_items FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM campaigns c
        JOIN folders f ON f.id = c.folder_id
        JOIN projects p ON p.id = f.project_id
        WHERE c.id = content_items.campaign_id AND can_edit_org(p.org_id)
    ));

-- ---- TASKS ----
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view tasks"
    ON tasks FOR SELECT
    USING (is_org_member(org_id));

CREATE POLICY "Editors can manage tasks"
    ON tasks FOR INSERT
    WITH CHECK (can_edit_org(org_id));

CREATE POLICY "Editors can update tasks"
    ON tasks FOR UPDATE
    USING (can_edit_org(org_id));

CREATE POLICY "Editors can delete tasks"
    ON tasks FOR DELETE
    USING (can_edit_org(org_id));

-- ---- CALENDAR_EVENTS ----
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view events"
    ON calendar_events FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM campaigns c
        JOIN folders f ON f.id = c.folder_id
        JOIN projects p ON p.id = f.project_id
        WHERE c.id = calendar_events.campaign_id AND is_org_member(p.org_id)
    ));

CREATE POLICY "Editors can manage events"
    ON calendar_events FOR ALL
    USING (EXISTS (
        SELECT 1 FROM campaigns c
        JOIN folders f ON f.id = c.folder_id
        JOIN projects p ON p.id = f.project_id
        WHERE c.id = calendar_events.campaign_id AND can_edit_org(p.org_id)
    ));

-- ---- VAULT_CREDENTIALS ----
ALTER TABLE vault_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view vault"
    ON vault_credentials FOR SELECT
    USING (is_org_member(org_id));

CREATE POLICY "Editors can manage vault"
    ON vault_credentials FOR INSERT
    WITH CHECK (can_edit_org(org_id));

CREATE POLICY "Editors can update vault"
    ON vault_credentials FOR UPDATE
    USING (can_edit_org(org_id));

CREATE POLICY "Editors can delete vault"
    ON vault_credentials FOR DELETE
    USING (can_edit_org(org_id));

-- ---- FEED_FOLDERS ----
ALTER TABLE feed_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view feed folders"
    ON feed_folders FOR SELECT
    USING (is_org_member(org_id));

CREATE POLICY "Editors can manage feed folders"
    ON feed_folders FOR ALL
    USING (can_edit_org(org_id));

-- ---- NOTES ----
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view notes"
    ON notes FOR SELECT
    USING (is_org_member(org_id));

CREATE POLICY "Editors can manage notes"
    ON notes FOR ALL
    USING (can_edit_org(org_id));

-- ---- BRAND_GUIDES ----
ALTER TABLE brand_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view brand guides"
    ON brand_guides FOR SELECT
    USING (is_org_member(org_id));

CREATE POLICY "Editors can manage brand guides"
    ON brand_guides FOR ALL
    USING (can_edit_org(org_id));

-- ---- BRAND_COLORS ----
ALTER TABLE brand_colors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view brand colors"
    ON brand_colors FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM brand_guides bg
        WHERE bg.id = brand_colors.guide_id AND is_org_member(bg.org_id)
    ));

CREATE POLICY "Editors can manage brand colors"
    ON brand_colors FOR ALL
    USING (EXISTS (
        SELECT 1 FROM brand_guides bg
        WHERE bg.id = brand_colors.guide_id AND can_edit_org(bg.org_id)
    ));

-- ---- BRAND_FONTS ----
ALTER TABLE brand_fonts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view brand fonts"
    ON brand_fonts FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM brand_guides bg
        WHERE bg.id = brand_fonts.guide_id AND is_org_member(bg.org_id)
    ));

CREATE POLICY "Editors can manage brand fonts"
    ON brand_fonts FOR ALL
    USING (EXISTS (
        SELECT 1 FROM brand_guides bg
        WHERE bg.id = brand_fonts.guide_id AND can_edit_org(bg.org_id)
    ));

-- ---- BRAND_LOGOS ----
ALTER TABLE brand_logos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view brand logos"
    ON brand_logos FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM brand_guides bg
        WHERE bg.id = brand_logos.guide_id AND is_org_member(bg.org_id)
    ));

CREATE POLICY "Editors can manage brand logos"
    ON brand_logos FOR ALL
    USING (EXISTS (
        SELECT 1 FROM brand_guides bg
        WHERE bg.id = brand_logos.guide_id AND can_edit_org(bg.org_id)
    ));

-- ---- BRAND_LOGO_RULES ----
ALTER TABLE brand_logo_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view brand logo rules"
    ON brand_logo_rules FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM brand_guides bg
        WHERE bg.id = brand_logo_rules.guide_id AND is_org_member(bg.org_id)
    ));

CREATE POLICY "Editors can manage brand logo rules"
    ON brand_logo_rules FOR ALL
    USING (EXISTS (
        SELECT 1 FROM brand_guides bg
        WHERE bg.id = brand_logo_rules.guide_id AND can_edit_org(bg.org_id)
    ));

-- ---- BRAND_MOOD_IMAGES ----
ALTER TABLE brand_mood_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view brand mood images"
    ON brand_mood_images FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM brand_guides bg
        WHERE bg.id = brand_mood_images.guide_id AND is_org_member(bg.org_id)
    ));

CREATE POLICY "Editors can manage brand mood images"
    ON brand_mood_images FOR ALL
    USING (EXISTS (
        SELECT 1 FROM brand_guides bg
        WHERE bg.id = brand_mood_images.guide_id AND can_edit_org(bg.org_id)
    ));

-- ---- FEED_POSTS ----
ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view feed posts"
    ON feed_posts FOR SELECT
    USING (is_org_member(org_id));

CREATE POLICY "Editors can manage feed posts"
    ON feed_posts FOR ALL
    USING (can_edit_org(org_id));

-- ---- PORTAL_CLIENTS ----
ALTER TABLE portal_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view portal clients"
    ON portal_clients FOR SELECT
    USING (is_org_member(org_id));

CREATE POLICY "Editors can manage portal clients"
    ON portal_clients FOR ALL
    USING (can_edit_org(org_id));

-- ---- PORTAL_FEEDS ----
ALTER TABLE portal_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view portal feeds"
    ON portal_feeds FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM portal_clients pc
        WHERE pc.id = portal_feeds.client_id AND is_org_member(pc.org_id)
    ));

CREATE POLICY "Editors can manage portal feeds"
    ON portal_feeds FOR ALL
    USING (EXISTS (
        SELECT 1 FROM portal_clients pc
        WHERE pc.id = portal_feeds.client_id AND can_edit_org(pc.org_id)
    ));

-- ---- PORTAL_REVIEW_POSTS ----
ALTER TABLE portal_review_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view review posts"
    ON portal_review_posts FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM portal_feeds pf
        JOIN portal_clients pc ON pc.id = pf.client_id
        WHERE pf.id = portal_review_posts.feed_id AND is_org_member(pc.org_id)
    ));

CREATE POLICY "Editors can manage review posts"
    ON portal_review_posts FOR ALL
    USING (EXISTS (
        SELECT 1 FROM portal_feeds pf
        JOIN portal_clients pc ON pc.id = pf.client_id
        WHERE pf.id = portal_review_posts.feed_id AND can_edit_org(pc.org_id)
    ));

-- ---- PORTAL_COMMENTS ----
ALTER TABLE portal_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view comments"
    ON portal_comments FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM portal_review_posts prp
        JOIN portal_feeds pf ON pf.id = prp.feed_id
        JOIN portal_clients pc ON pc.id = pf.client_id
        WHERE prp.id = portal_comments.post_id AND is_org_member(pc.org_id)
    ));

CREATE POLICY "Editors can manage comments"
    ON portal_comments FOR ALL
    USING (EXISTS (
        SELECT 1 FROM portal_review_posts prp
        JOIN portal_feeds pf ON pf.id = prp.feed_id
        JOIN portal_clients pc ON pc.id = pf.client_id
        WHERE prp.id = portal_comments.post_id AND can_edit_org(pc.org_id)
    ));

-- ---- TOOL_REGISTRY (public read) ----
ALTER TABLE tool_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tools"
    ON tool_registry FOR SELECT
    USING (true);

-- ---- ORG_TOOLS ----
ALTER TABLE org_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org tools"
    ON org_tools FOR SELECT
    USING (is_org_member(org_id));

CREATE POLICY "Admins can manage org tools"
    ON org_tools FOR ALL
    USING (has_org_role(org_id, 'admin'));

-- ==========================================================================
-- TRIGGER: Auto-add creator as admin when org is created
-- ==========================================================================

CREATE OR REPLACE FUNCTION handle_new_org()
RETURNS trigger AS $$
DECLARE
    creator_id uuid := COALESCE(NEW.created_by, auth.uid());
BEGIN
    IF creator_id IS NULL THEN
        RAISE EXCEPTION 'Cannot create organization without an authenticated user';
    END IF;

    INSERT INTO org_members (org_id, user_id, role)
    VALUES (NEW.id, creator_id, 'admin')
    ON CONFLICT (org_id, user_id) DO NOTHING;

    -- Enable all default tools for the new org
    INSERT INTO org_tools (org_id, tool_id, enabled)
    SELECT NEW.id, id, true FROM tool_registry WHERE is_active = true
    ON CONFLICT (org_id, tool_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_org_created
    AFTER INSERT ON organizations
    FOR EACH ROW EXECUTE FUNCTION handle_new_org();

-- ==========================================================================
-- TRIGGER: Auto-update updated_at timestamps
-- ==========================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON content_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON vault_credentials FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON portal_clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON portal_review_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON brand_guides FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==========================================================================
-- DONE! Your Social Suite database is ready.
-- ==========================================================================
