import { createClient } from 'npm:@supabase/supabase-js@2';
import { currentUserId, getRequiredSecret, getUserClient, jsonResponse, readJson, requireMethod } from '../_shared/http.ts';

type Permission = 'read' | 'write';

type RequestBody = {
  action: 'list' | 'create' | 'revoke';
  orgId?: string;
  name?: string;
  permission?: Permission;
  keyId?: string;
};

type ServiceClient = ReturnType<typeof createClient>;

const KEY_BYTES = 32;
const MAX_KEYS_PER_USER_ORG = 20;

Deno.serve(async (req) => {
  const methodResponse = requireMethod(req);
  if (methodResponse) return methodResponse;

  try {
    const userClient = getUserClient(req);
    const userId = await currentUserId(userClient);
    const body = await readJson<RequestBody>(req);
    const service = getServiceClient();

    if (body.action === 'list') {
      const orgId = await requireOrgMembership(service, userId, body.orgId);
      return jsonResponse({ keys: await listKeys(service, userId, orgId) });
    }

    if (body.action === 'create') {
      const orgId = await requireOrgMembership(service, userId, body.orgId);
      const permission = body.permission === 'write' ? 'write' : 'read';
      if (permission === 'write') await requireWriteEligibleMembership(service, userId, orgId);
      const result = await createKey(service, userId, orgId, cleanName(body.name), permission);
      return jsonResponse(result);
    }

    if (body.action === 'revoke') {
      const orgId = await requireOrgMembership(service, userId, body.orgId);
      if (!body.keyId) return jsonResponse({ error: 'keyId is required' }, 400);
      await revokeKey(service, userId, orgId, body.keyId);
      return jsonResponse({ revoked: true });
    }

    return jsonResponse({ error: 'Unsupported action' }, 400);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'API key request failed' }, 500);
  }
});

const getServiceClient = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, getRequiredSecret('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

const cleanName = (value: unknown) => {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('Key name is required');
  return name.slice(0, 80);
};

async function requireOrgMembership(service: ServiceClient, userId: string, requestedOrgId?: string) {
  let query = service
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', userId)
    .limit(1);

  if (requestedOrgId) query = query.eq('org_id', requestedOrgId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data?.org_id) throw new Error('You are not a member of this workspace');
  return data.org_id as string;
}

async function requireWriteEligibleMembership(service: ServiceClient, userId: string, orgId: string) {
  const { data, error } = await service
    .from('org_members')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !['admin', 'editor'].includes(String(data.role))) {
    throw new Error('Only admins and editors can create write API keys');
  }
}

async function listKeys(service: ServiceClient, userId: string, orgId: string) {
  const { data, error } = await service
    .from('account_api_keys')
    .select('id, name, key_prefix, permission, last_used_at, expires_at, revoked_at, created_at')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function createKey(service: ServiceClient, userId: string, orgId: string, name: string, permission: Permission) {
  const { count, error: countError } = await service
    .from('account_api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .is('revoked_at', null);
  if (countError) throw countError;
  if ((count || 0) >= MAX_KEYS_PER_USER_ORG) {
    throw new Error(`You can keep up to ${MAX_KEYS_PER_USER_ORG} active API keys per workspace`);
  }

  const apiKey = `ss_${permission}_${randomToken()}`;
  const keyHash = await sha256(apiKey);
  const keyPrefix = apiKey.slice(0, 18);

  const { data, error } = await service
    .from('account_api_keys')
    .insert({
      org_id: orgId,
      user_id: userId,
      name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      permission,
    })
    .select('id, name, key_prefix, permission, last_used_at, expires_at, revoked_at, created_at')
    .single();
  if (error) throw error;

  return { key: data, secret: apiKey };
}

async function revokeKey(service: ServiceClient, userId: string, orgId: string, keyId: string) {
  const { data, error } = await service
    .from('account_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('API key was not found or is already revoked');
}

function randomToken() {
  const bytes = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return base64Url(new Uint8Array(digest));
}
