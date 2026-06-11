import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ROLES = ['admin', 'editor', 'viewer'] as const;
type TeamRole = typeof ROLES[number];

type JsonRecord = Record<string, unknown>;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const cleanText = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
const normalizeEmail = (value: unknown) => cleanText(value).toLowerCase();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  let body: JsonRecord;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const service = getServiceClient();
  const action = cleanText(body.action);

  try {
    if (action === 'lookup') return await lookupInvitation(service, body);
    if (action === 'accept') return await acceptInvitation(req, service, body);
    if (action === 'list') return await listTeam(req, service, body);
    if (action === 'invite') return await createInvitation(req, service, body);
    if (action === 'revoke') return await revokeInvitation(req, service, body);

    return jsonResponse({ error: 'Unsupported team invitation action.' }, 400);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Team invitation request failed.';
    return jsonResponse({ error: message }, status);
  }
});

async function listTeam(req: Request, service: SupabaseClient, body: JsonRecord) {
  const user = await requireUser(req);
  const orgId = cleanText(body.orgId);
  if (!orgId) throw new HttpError('Organization is required.', 400);

  const membership = await requireMembership(service, orgId, user.id);
  const members = await loadMembers(service, orgId);
  const invitations = membership.role === 'admin' ? await loadPendingInvitations(service, orgId) : [];

  return jsonResponse({
    currentRole: membership.role,
    canInvite: membership.role === 'admin',
    members,
    invitations,
  });
}

async function createInvitation(req: Request, service: SupabaseClient, body: JsonRecord) {
  const user = await requireUser(req);
  const orgId = cleanText(body.orgId);
  const email = normalizeEmail(body.email);
  const role = cleanText(body.role) as TeamRole;
  const sendEmail = Boolean(body.sendEmail);

  if (!orgId) throw new HttpError('Organization is required.', 400);
  if (!isValidEmail(email)) throw new HttpError('Enter a valid invitee email.', 400);
  if (!ROLES.includes(role)) throw new HttpError('Choose a valid team role.', 400);

  const membership = await requireMembership(service, orgId, user.id);
  if (membership.role !== 'admin') throw new HttpError('Only admins can invite team members.', 403);

  const org = await loadOrganization(service, orgId);
  const existingUser = await findUserByEmail(service, email);
  if (existingUser) {
    const { data: existingMember, error: existingMemberError } = await service
      .from('org_members')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', existingUser.id)
      .maybeSingle();
    if (existingMemberError) throw existingMemberError;
    if (existingMember) throw new HttpError('That person is already a member of this organization.', 409);
  }

  const token = createInviteToken();
  const tokenHash = await hashToken(token);
  const origin = resolveSiteOrigin(req, body);
  const inviteUrl = `${origin}/invite/${token}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const payload = {
    org_id: orgId,
    email,
    role,
    token_hash: tokenHash,
    invited_by: user.id,
    status: 'pending',
    delivery_method: sendEmail ? 'email' : 'link',
    expires_at: expiresAt,
    accepted_by: null,
    accepted_at: null,
    revoked_at: null,
  };

  const { data: existingInvite, error: existingInviteError } = await service
    .from('team_invitations')
    .select('id')
    .eq('org_id', orgId)
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle();
  if (existingInviteError) throw existingInviteError;

  const invitation = existingInvite
    ? await updateInvitation(service, existingInvite.id, payload)
    : await insertInvitation(service, payload);

  let emailSent = false;
  let emailError = '';

  if (sendEmail) {
    const delivery = await sendInviteEmail(service, email, inviteUrl, org.name, role, invitation.id);
    emailSent = delivery.sent;
    emailError = delivery.error;

    if (emailSent) {
      const { error: sentError } = await service
        .from('team_invitations')
        .update({ last_sent_at: now, delivery_method: 'email' })
        .eq('id', invitation.id);
      if (sentError) throw sentError;
    }
  }

  return jsonResponse({
    ok: true,
    invitation: {
      id: invitation.id,
      email,
      role,
      status: 'pending',
      expiresAt,
      deliveryMethod: sendEmail ? 'email' : 'link',
    },
    inviteUrl,
    emailSent,
    emailError,
  });
}

async function lookupInvitation(service: SupabaseClient, body: JsonRecord) {
  const token = cleanText(body.token);
  if (!token) throw new HttpError('Invitation token is required.', 400);

  const invitation = await loadInvitationByToken(service, token);
  if (!invitation) throw new HttpError('This invitation is invalid or has been removed.', 404);

  const expired = new Date(invitation.expires_at).getTime() < Date.now();
  if (expired || invitation.status === 'expired') {
    if (invitation.status === 'pending') {
      await service.from('team_invitations').update({ status: 'expired' }).eq('id', invitation.id);
    }
    return jsonResponse({ status: 'expired', error: 'This invitation has expired.' }, 410);
  }

  if (invitation.status !== 'pending') {
    return jsonResponse({ status: invitation.status, error: `This invitation is ${invitation.status}.` }, 409);
  }

  const org = await loadOrganization(service, invitation.org_id);
  return jsonResponse({
    status: 'pending',
    invitation: {
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expires_at,
      organization: org,
    },
  });
}

async function acceptInvitation(req: Request, service: SupabaseClient, body: JsonRecord) {
  const user = await requireUser(req);
  const token = cleanText(body.token);
  if (!token) throw new HttpError('Invitation token is required.', 400);

  const invitation = await loadInvitationByToken(service, token);
  if (!invitation) throw new HttpError('This invitation is invalid or has been removed.', 404);

  if (invitation.status === 'accepted' && invitation.accepted_by === user.id) {
    const org = await loadOrganization(service, invitation.org_id);
    return jsonResponse({ ok: true, org, membership: { role: invitation.role } });
  }

  if (invitation.status !== 'pending') {
    throw new HttpError(`This invitation is ${invitation.status}.`, 409);
  }

  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    await service.from('team_invitations').update({ status: 'expired' }).eq('id', invitation.id);
    throw new HttpError('This invitation has expired.', 410);
  }

  const signedInEmail = normalizeEmail(user.email);
  if (!signedInEmail || signedInEmail !== invitation.email) {
    throw new HttpError(`Please sign in with ${invitation.email} to accept this invitation.`, 403);
  }

  const { data: existingMember, error: existingMemberError } = await service
    .from('org_members')
    .select('id')
    .eq('org_id', invitation.org_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (existingMemberError) throw existingMemberError;

  if (existingMember) {
    const { error: updateMemberError } = await service
      .from('org_members')
      .update({ role: invitation.role })
      .eq('id', existingMember.id);
    if (updateMemberError) throw updateMemberError;
  } else {
    const { error: insertMemberError } = await service
      .from('org_members')
      .insert({ org_id: invitation.org_id, user_id: user.id, role: invitation.role });
    if (insertMemberError) throw insertMemberError;
  }

  const acceptedAt = new Date().toISOString();
  const { error: acceptError } = await service
    .from('team_invitations')
    .update({
      status: 'accepted',
      accepted_by: user.id,
      accepted_at: acceptedAt,
    })
    .eq('id', invitation.id);
  if (acceptError) throw acceptError;

  const org = await loadOrganization(service, invitation.org_id);
  return jsonResponse({ ok: true, org, membership: { role: invitation.role, joinedAt: acceptedAt } });
}

async function revokeInvitation(req: Request, service: SupabaseClient, body: JsonRecord) {
  const user = await requireUser(req);
  const orgId = cleanText(body.orgId);
  const invitationId = cleanText(body.invitationId);
  if (!orgId || !invitationId) throw new HttpError('Organization and invitation are required.', 400);

  const membership = await requireMembership(service, orgId, user.id);
  if (membership.role !== 'admin') throw new HttpError('Only admins can revoke invitations.', 403);

  const { error } = await service
    .from('team_invitations')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('org_id', orgId)
    .eq('status', 'pending');
  if (error) throw error;

  return jsonResponse({ ok: true });
}

async function loadMembers(service: SupabaseClient, orgId: string) {
  const { data, error } = await service
    .from('org_members')
    .select('id, org_id, user_id, role, joined_at')
    .eq('org_id', orgId)
    .order('joined_at', { ascending: true });
  if (error) throw error;

  return await Promise.all((data || []).map(async (member) => {
    const { data: userData } = await service.auth.admin.getUserById(member.user_id);
    const authUser = userData?.user;
    const metadata = (authUser?.user_metadata || {}) as JsonRecord;
    const email = authUser?.email || '';
    const fallbackName = email ? email.split('@')[0] : 'Member';

    return {
      id: member.id,
      userId: member.user_id,
      orgId: member.org_id,
      role: member.role,
      joinedAt: member.joined_at,
      email,
      name: cleanText(metadata.full_name || metadata.name) || fallbackName,
      avatarUrl: cleanText(metadata.avatar_url),
    };
  }));
}

async function loadPendingInvitations(service: SupabaseClient, orgId: string) {
  const { data, error } = await service
    .from('team_invitations')
    .select('id, email, role, status, delivery_method, expires_at, last_sent_at, created_at')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data || []).map((invite) => ({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    status: new Date(invite.expires_at).getTime() < Date.now() ? 'expired' : invite.status,
    deliveryMethod: invite.delivery_method,
    expiresAt: invite.expires_at,
    lastSentAt: invite.last_sent_at,
    createdAt: invite.created_at,
  }));
}

async function requireUser(req: Request): Promise<User> {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader) throw new HttpError('Authentication required.', 401);

  const userClient = createClient(getSupabaseUrl(), getPublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new HttpError('Authentication required.', 401);
  return data.user;
}

async function requireMembership(service: SupabaseClient, orgId: string, userId: string) {
  const { data, error } = await service
    .from('org_members')
    .select('id, role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError('You do not have access to this organization.', 403);
  return data as { id: string; role: TeamRole };
}

async function loadOrganization(service: SupabaseClient, orgId: string) {
  const { data, error } = await service
    .from('organizations')
    .select('id, name, slug')
    .eq('id', orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError('Organization not found.', 404);
  return data;
}

async function loadInvitationByToken(service: SupabaseClient, token: string) {
  const tokenHash = await hashToken(token);
  const { data, error } = await service
    .from('team_invitations')
    .select('id, org_id, email, role, status, expires_at, accepted_by')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) throw error;
  return data as null | {
    id: string;
    org_id: string;
    email: string;
    role: TeamRole;
    status: string;
    expires_at: string;
    accepted_by: string | null;
  };
}

async function insertInvitation(service: SupabaseClient, payload: JsonRecord) {
  const { data, error } = await service
    .from('team_invitations')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw error;
  return data as { id: string };
}

async function updateInvitation(service: SupabaseClient, id: string, payload: JsonRecord) {
  const { data, error } = await service
    .from('team_invitations')
    .update(payload)
    .eq('id', id)
    .select('id')
    .single();
  if (error) throw error;
  return data as { id: string };
}

async function findUserByEmail(service: SupabaseClient, email: string) {
  const perPage = 1000;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((candidate) => normalizeEmail(candidate.email) === email);
    if (found) return found;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function sendInviteEmail(
  service: SupabaseClient,
  email: string,
  inviteUrl: string,
  organizationName: string,
  role: TeamRole,
  invitationId: string,
) {
  const metadata = {
    team_invitation_id: invitationId,
    team_invitation_url: inviteUrl,
    team_invitation_role: role,
    team_invitation_org_name: organizationName,
  };

  const { error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteUrl,
    data: metadata,
  });

  if (!inviteError) return { sent: true, error: '' };

  if (/already|registered|exist/i.test(inviteError.message)) {
    const { error: magicLinkError } = await service.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: inviteUrl,
        shouldCreateUser: false,
      },
    });
    if (!magicLinkError) return { sent: true, error: '' };
    return { sent: false, error: magicLinkError.message };
  }

  return { sent: false, error: inviteError.message };
}

function getServiceClient() {
  return createClient(getSupabaseUrl(), getServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getSupabaseUrl() {
  const value = Deno.env.get('SUPABASE_URL');
  if (!value) throw new Error('SUPABASE_URL is not configured.');
  return value;
}

function getPublishableKey() {
  const legacyAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacyAnonKey) return legacyAnonKey;

  const publishableKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (publishableKeys) {
    const parsed = JSON.parse(publishableKeys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }

  throw new Error('Supabase publishable key is not configured.');
}

function getServiceKey() {
  const legacyServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacyServiceRoleKey) return legacyServiceRoleKey;

  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeys) {
    const parsed = JSON.parse(secretKeys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }

  throw new Error('Supabase service key is not configured.');
}

function resolveSiteOrigin(req: Request, body: JsonRecord) {
  const configured = cleanText(Deno.env.get('APP_SITE_URL'));
  const requested = cleanText(body.siteUrl);
  const headerOrigin = cleanText(req.headers.get('Origin'));

  return normalizeOrigin(requested) || normalizeOrigin(configured) || normalizeOrigin(headerOrigin) || 'http://localhost:8080';
}

function normalizeOrigin(value: string) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function createInviteToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const random = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${crypto.randomUUID()}.${random}`;
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
