import { invokeFunction } from '@/services/edgeFunctions';

export type AccountApiKeyPermission = 'read' | 'write';

export type AccountApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  permission: AccountApiKeyPermission;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export async function listAccountApiKeys(orgId: string) {
  const result = await invokeFunction<{ keys: AccountApiKey[] }>('account-api-keys', {
    action: 'list',
    orgId,
  });
  return result.keys;
}

export async function createAccountApiKey({
  orgId,
  name,
  permission,
}: {
  orgId: string;
  name: string;
  permission: AccountApiKeyPermission;
}) {
  return invokeFunction<{ key: AccountApiKey; secret: string }>('account-api-keys', {
    action: 'create',
    orgId,
    name,
    permission,
  });
}

export async function revokeAccountApiKey({ orgId, keyId }: { orgId: string; keyId: string }) {
  return invokeFunction<{ revoked: boolean }>('account-api-keys', {
    action: 'revoke',
    orgId,
    keyId,
  });
}
