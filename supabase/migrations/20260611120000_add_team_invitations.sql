CREATE TABLE IF NOT EXISTS team_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email text NOT NULL,
    role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
    token_hash text NOT NULL UNIQUE,
    invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    delivery_method text NOT NULL DEFAULT 'link' CHECK (delivery_method IN ('link', 'email')),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
    last_sent_at timestamptz,
    accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    accepted_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_org ON team_invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON team_invitations(org_id, status);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(org_id, lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_pending_email
    ON team_invitations(org_id, lower(email))
    WHERE status = 'pending';

ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE team_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE team_invitations TO service_role;

DROP POLICY IF EXISTS "Admins can view team invitations" ON team_invitations;
CREATE POLICY "Admins can view team invitations"
    ON team_invitations FOR SELECT
    TO authenticated
    USING (has_org_role(org_id, 'admin'));

DROP POLICY IF EXISTS "Admins can create team invitations" ON team_invitations;
CREATE POLICY "Admins can create team invitations"
    ON team_invitations FOR INSERT
    TO authenticated
    WITH CHECK (has_org_role(org_id, 'admin') AND invited_by = auth.uid());

DROP POLICY IF EXISTS "Admins can update team invitations" ON team_invitations;
CREATE POLICY "Admins can update team invitations"
    ON team_invitations FOR UPDATE
    TO authenticated
    USING (has_org_role(org_id, 'admin'))
    WITH CHECK (has_org_role(org_id, 'admin'));

DROP POLICY IF EXISTS "Admins can delete team invitations" ON team_invitations;
CREATE POLICY "Admins can delete team invitations"
    ON team_invitations FOR DELETE
    TO authenticated
    USING (has_org_role(org_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at_team_invitations ON team_invitations;
CREATE TRIGGER set_updated_at_team_invitations
    BEFORE UPDATE ON team_invitations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
