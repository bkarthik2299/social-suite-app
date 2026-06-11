ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON public.organizations(created_by);

WITH first_membership AS (
    SELECT DISTINCT ON (org_id)
        org_id,
        user_id
    FROM public.org_members
    ORDER BY
        org_id,
        CASE role
            WHEN 'admin' THEN 0
            WHEN 'editor' THEN 1
            ELSE 2
        END,
        joined_at NULLS LAST
)
UPDATE public.organizations org
SET created_by = first_membership.user_id
FROM first_membership
WHERE org.id = first_membership.org_id
  AND org.created_by IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_org()
RETURNS trigger AS $$
DECLARE
    creator_id uuid := COALESCE(NEW.created_by, auth.uid());
BEGIN
    IF creator_id IS NULL THEN
        RAISE EXCEPTION 'Cannot create organization without an authenticated user';
    END IF;

    INSERT INTO public.org_members (org_id, user_id, role)
    VALUES (NEW.id, creator_id, 'admin')
    ON CONFLICT (org_id, user_id) DO NOTHING;

    INSERT INTO public.org_tools (org_id, tool_id, enabled)
    SELECT NEW.id, id, true FROM public.tool_registry WHERE is_active = true
    ON CONFLICT (org_id, tool_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "Members can view their org" ON public.organizations;
CREATE POLICY "Members can view their org"
    ON public.organizations FOR SELECT
    USING (is_org_member(id) OR created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can create orgs" ON public.organizations;
CREATE POLICY "Authenticated users can create orgs"
    ON public.organizations FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.uid()) IS NOT NULL AND created_by = (select auth.uid()));
