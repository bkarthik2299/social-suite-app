import React, { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  createAccountApiKey,
  listAccountApiKeys,
  revokeAccountApiKey,
  type AccountApiKey,
  type AccountApiKeyPermission,
} from '@/services/accountApiKeys';
import { CheckCircle2, Copy, ExternalLink, KeyRound, Loader2, ShieldCheck, Trash2 } from 'lucide-react';

const REPO_URL = 'https://github.com/bkarthik2299/socialsuite-agent-tools';
const PLACEHOLDER_KEY = '<paste_your_socialsuite_api_key_here>';

export default function SocialSuiteMcp() {
  const { organization } = useAuth();
  const { toast } = useToast();
  const [apiKeys, setApiKeys] = useState<AccountApiKey[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('Hermes MCP');
  const [keyPermission, setKeyPermission] = useState<AccountApiKeyPermission>('write');
  const [newApiSecret, setNewApiSecret] = useState('');
  const setupPrompt = useMemo(() => buildSetupPrompt(newApiSecret || PLACEHOLDER_KEY), [newApiSecret]);

  const getErrorMessage = (error: unknown) => (
    error instanceof Error ? error.message : 'Something went wrong. Please try again.'
  );

  const loadApiKeys = async () => {
    if (!organization?.id) return;
    setIsLoadingKeys(true);
    try {
      setApiKeys(await listAccountApiKeys(organization.id));
    } catch (error: unknown) {
      toast({ variant: 'destructive', title: 'Could not load API keys', description: getErrorMessage(error) });
    } finally {
      setIsLoadingKeys(false);
    }
  };

  useEffect(() => {
    void loadApiKeys();
  }, [organization?.id]);

  const copyText = async (value: string, title = 'Copied') => {
    await navigator.clipboard.writeText(value);
    toast({ title });
  };

  const handleCreateApiKey = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organization?.id) {
      toast({ variant: 'destructive', title: 'Workspace unavailable', description: 'Join or create a workspace before creating API keys.' });
      return;
    }

    setIsCreatingKey(true);
    try {
      const result = await createAccountApiKey({
        orgId: organization.id,
        name: keyName,
        permission: keyPermission,
      });
      setApiKeys((current) => [result.key, ...current]);
      setNewApiSecret(result.secret);
      setKeyName('Hermes MCP');
      setKeyPermission('write');
      toast({ title: 'MCP API key created', description: 'Copy the installer before closing the key window.' });
    } catch (error: unknown) {
      toast({ variant: 'destructive', title: 'Could not create API key', description: getErrorMessage(error) });
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleRevokeApiKey = async (keyId: string) => {
    if (!organization?.id) return;
    setRevokingKeyId(keyId);
    try {
      await revokeAccountApiKey({ orgId: organization.id, keyId });
      setApiKeys((current) => current.map((key) => key.id === keyId ? { ...key, revoked_at: new Date().toISOString() } : key));
      toast({ title: 'API key revoked' });
    } catch (error: unknown) {
      toast({ variant: 'destructive', title: 'Could not revoke API key', description: getErrorMessage(error) });
    } finally {
      setRevokingKeyId(null);
    }
  };

  return (
    <AppLayout breadcrumbs={[{ label: 'Social Suite MCP', path: '/socialsuite-mcp' }]}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 pb-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Agent access
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Social Suite MCP</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Connect Hermes, OpenClaw, or another local agent to your Social Suite workspace with one API key and the SocialSuite Agent Tools MCP.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => window.open(REPO_URL, '_blank', 'noopener,noreferrer')}>
            <ExternalLink className="mr-2 h-4 w-4" />
            GitHub Repo
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg border border-blue-100 bg-blue-50 p-2 text-[#007AFF]">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle>Create MCP API Key</CardTitle>
                    <CardDescription>Use write access for the full Social Suite app experience from your agent.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateApiKey} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]">
                  <div className="space-y-2">
                    <Label htmlFor="mcpKeyName">Key Name</Label>
                    <Input
                      id="mcpKeyName"
                      value={keyName}
                      onChange={(event) => setKeyName(event.target.value)}
                      placeholder="e.g. Hermes MCP"
                      required
                      maxLength={80}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Access</Label>
                    <Select value={keyPermission} onValueChange={(value) => setKeyPermission(value as AccountApiKeyPermission)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="write">Write</SelectItem>
                        <SelectItem value="read">Read</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" disabled={isCreatingKey || !organization?.id} className="w-full bg-[#007AFF] text-white hover:bg-blue-600">
                      {isCreatingKey && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create Key
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Setup Prompt</CardTitle>
                <CardDescription>Copy this into Hermes, OpenClaw, or another agent that can set up local MCP tools.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={setupPrompt}
                  readOnly
                  className="min-h-[220px] resize-none bg-slate-950 font-mono text-xs leading-5 text-slate-100"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" className="bg-[#007AFF] text-white hover:bg-blue-600" onClick={() => copyText(setupPrompt, 'Setup prompt copied')}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Setup Prompt
                  </Button>
                  <Button type="button" variant="outline" onClick={() => copyText(REPO_URL, 'Repo copied')}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Repo
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>What To Set Up</CardTitle>
                <CardDescription>The copied prompt tells your agent what it needs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                {[
                  'Clones socialsuite-agent-tools from GitHub',
                  'Installs and builds the SocialSuite MCP server',
                  'Adds the API key to the MCP .env file',
                  'Copies the Hermes SocialSuite skill locally',
                  'Connects the local MCP server to the agent',
                ].map((item) => (
                  <div key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>Created keys are shown once, so revoke and recreate a key if you need a fresh secret.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-200">
              {isLoadingKeys ? (
                <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading API keys
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">No API keys yet.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {apiKeys.map((key) => {
                    const revoked = !!key.revoked_at;
                    return (
                      <div key={key.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-slate-900">{key.name}</p>
                            <Badge variant="outline" className={key.permission === 'write' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-blue-200 bg-blue-50 text-blue-700'}>
                              {key.permission === 'write' ? 'Write' : 'Read'}
                            </Badge>
                            {revoked && <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-500">Revoked</Badge>}
                          </div>
                          <p className="font-mono text-xs text-slate-500">{key.key_prefix}...</p>
                          <p className="text-xs text-slate-500">Created {formatDate(key.created_at)} · Last used {formatDate(key.last_used_at)}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-fit text-red-500 hover:bg-red-50 hover:text-red-600"
                          disabled={revoked || revokingKeyId === key.id}
                          onClick={() => handleRevokeApiKey(key.id)}
                        >
                          {revokingKeyId === key.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                          Revoke
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!newApiSecret} onOpenChange={(open) => !open && setNewApiSecret('')}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Copy Your MCP Setup Prompt</DialogTitle>
            <DialogDescription>This API key is shown once. Copy the setup prompt now to include it automatically.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm break-all text-slate-800">
              {newApiSecret}
            </div>
            <Textarea
              value={setupPrompt}
              readOnly
              className="min-h-[200px] resize-none bg-slate-950 font-mono text-xs leading-5 text-slate-100"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => copyText(newApiSecret, 'API key copied')}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Key
            </Button>
            <Button type="button" className="bg-[#007AFF] text-white hover:bg-blue-600" onClick={() => copyText(setupPrompt, 'Setup prompt copied')}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Setup Prompt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function buildSetupPrompt(apiKey: string) {
  return [
    'Set up Social Suite MCP for this agent.',
    '',
    `GitHub repo: ${REPO_URL}`,
    `Social Suite API key: ${apiKey}`,
    '',
    'Please clone the repo, install and build the MCP package in mcp/socialsuite, install the SocialSuite skill from skills/hermes/socialsuite, and configure the MCP server to run dist/api-key-index.js with the API key above in its .env file.',
    '',
    'After setup, restart the agent app and test it by asking: "Use SocialSuite MCP and tell me which Social Suite account is connected."',
  ].join('\n');
}

function formatDate(value?: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
