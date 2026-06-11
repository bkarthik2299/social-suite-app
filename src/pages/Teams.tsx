import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Copy, Loader2, Mail, RefreshCw, Send, Trash2, UserPlus, Users } from 'lucide-react';

import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

type TeamRole = 'admin' | 'editor' | 'viewer';

interface TeamMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: TeamRole;
  joinedAt: string | null;
  avatarUrl?: string;
}

interface TeamInvitation {
  id: string;
  email: string;
  role: TeamRole;
  status: 'pending' | 'expired';
  deliveryMethod: 'link' | 'email';
  expiresAt: string;
  lastSentAt: string | null;
  createdAt: string | null;
}

interface TeamResponse {
  currentRole: TeamRole;
  canInvite: boolean;
  members: TeamMember[];
  invitations: TeamInvitation[];
}

const roleStyles: Record<TeamRole, string> = {
  admin: 'border-blue-100 bg-blue-50 text-blue-700',
  editor: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  viewer: 'border-slate-200 bg-slate-50 text-slate-600',
};

const roleLabels: Record<TeamRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

const roleDescriptions: Record<TeamRole, string> = {
  admin: 'Full team and workspace control',
  editor: 'Create and edit workspace content',
  viewer: 'Read-only workspace access',
};

export default function Teams() {
  const { organization, membership, user } = useAuth();
  const { toast } = useToast();
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('viewer');
  const [generatedLink, setGeneratedLink] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState<'link' | 'email' | null>(null);
  const [rowActionId, setRowActionId] = useState('');

  const canInvite = team?.canInvite ?? membership?.role === 'admin';
  const members = team?.members ?? [];
  const invitations = team?.invitations ?? [];

  const currentMember = useMemo(() => {
    if (!user) return null;
    return members.find((member) => member.userId === user.id) || null;
  }, [members, user]);

  const loadTeam = useCallback(async () => {
    if (!organization?.id) return;

    setLoading(true);
    setLoadError('');

    const { data, error } = await supabase.functions.invoke('team-invitations', {
      body: { action: 'list', orgId: organization.id },
    });

    if (error) {
      setLoadError(await readFunctionError(error, 'Could not load team members.'));
      setTeam(null);
    } else {
      setTeam(data as TeamResponse);
    }

    setLoading(false);
  }, [organization?.id]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const resetInviteForm = () => {
    setInviteEmail('');
    setInviteRole('viewer');
    setGeneratedLink('');
    setInviteSubmitting(null);
  };

  const copyText = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast({ title: 'Invite link copied' });
  };

  const createInvite = async (sendEmail: boolean, sourceInvite?: TeamInvitation) => {
    if (!organization?.id) return;

    const email = (sourceInvite?.email || inviteEmail).trim().toLowerCase();
    const role = sourceInvite?.role || inviteRole;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ variant: 'destructive', title: 'Enter a valid email address' });
      return;
    }

    const actionLabel = sendEmail ? 'email' : 'link';
    setInviteSubmitting(sourceInvite ? null : actionLabel);
    if (sourceInvite) setRowActionId(`${sourceInvite.id}:${actionLabel}`);

    try {
      const { data, error } = await supabase.functions.invoke('team-invitations', {
        body: {
          action: 'invite',
          orgId: organization.id,
          email,
          role,
          sendEmail,
          siteUrl: window.location.origin,
        },
      });

      if (error) {
        toast({ variant: 'destructive', title: 'Invite failed', description: await readFunctionError(error, 'Invite failed.') });
        return;
      }

      const response = data as { inviteUrl?: string; emailSent?: boolean; emailError?: string };
      if (response.inviteUrl) {
        setGeneratedLink(response.inviteUrl);
        if (!sendEmail) await copyText(response.inviteUrl);
      }

      if (sendEmail) {
        if (response.emailSent) {
          toast({ title: 'Invite email sent', description: `Sent to ${email}.` });
        } else {
          toast({
            variant: 'destructive',
            title: 'Invite link created',
            description: response.emailError || 'Email delivery failed. Copy the invite link instead.',
          });
        }
      }

      await loadTeam();
    } finally {
      setInviteSubmitting(null);
      setRowActionId('');
    }
  };

  const revokeInvite = async (invitation: TeamInvitation) => {
    if (!organization?.id) return;
    setRowActionId(`${invitation.id}:revoke`);

    try {
      const { error } = await supabase.functions.invoke('team-invitations', {
        body: {
          action: 'revoke',
          orgId: organization.id,
          invitationId: invitation.id,
        },
      });

      if (error) {
        toast({ variant: 'destructive', title: 'Could not revoke invitation', description: await readFunctionError(error, 'Could not revoke invitation.') });
        return;
      }

      toast({ title: 'Invitation revoked', description: invitation.email });
      await loadTeam();
    } finally {
      setRowActionId('');
    }
  };

  return (
    <AppLayout breadcrumbs={[{ label: 'Teams', path: '/teams' }]}>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
          <p className="text-muted-foreground">Manage workspace members and access levels.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="rounded-xl" onClick={() => void loadTeam()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            className="gap-2 rounded-full bg-primary px-6 text-white hover:bg-primary/90"
            onClick={() => {
              resetInviteForm();
              setInviteDialogOpen(true);
            }}
            disabled={!canInvite}
          >
            <UserPlus className="h-4 w-4" />
            Invite Member
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <TeamMetric icon={<Users className="h-4 w-4" />} label="Members" value={String(members.length)} />
        <TeamMetric icon={<Mail className="h-4 w-4" />} label="Pending" value={String(invitations.filter((invite) => invite.status === 'pending').length)} />
        <TeamMetric icon={<CheckCircle2 className="h-4 w-4" />} label="Your Role" value={roleLabels[currentMember?.role || membership?.role || 'viewer']} />
      </div>

      {loadError && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {loadError}
        </div>
      )}

      <section className="tool-surface animate-fade-in overflow-hidden rounded-xl bg-white">
        <div className="flex items-center justify-between border-b border-blue-100/60 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold uppercase text-slate-500">Members</h2>
            <p className="text-sm text-slate-500">{organization?.name}</p>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-blue-100/60 bg-slate-50/80 hover:bg-slate-50/80">
                <TableHead className="min-w-[220px] font-semibold text-foreground">Member</TableHead>
                <TableHead className="min-w-[220px] font-semibold text-foreground">Email</TableHead>
                <TableHead className="font-semibold text-foreground">Role</TableHead>
                <TableHead className="font-semibold text-foreground">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No team members found.
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    Loading team members...
                  </TableCell>
                </TableRow>
              )}
              {!loading && members.map((member) => (
                <TableRow key={member.id} className="border-blue-100/60 hover:bg-blue-50/35">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <MemberAvatar member={member} />
                      <span className="font-medium text-foreground">{member.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{member.email || 'Unavailable'}</TableCell>
                  <TableCell>
                    <RoleBadge role={member.role} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(member.joinedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {canInvite && (
        <section className="tool-surface mt-6 overflow-hidden rounded-xl bg-white">
          <div className="flex items-center justify-between border-b border-blue-100/60 px-4 py-3 sm:px-5">
            <div>
              <h2 className="text-sm font-semibold uppercase text-slate-500">Pending Invitations</h2>
              <p className="text-sm text-slate-500">Invite links expire after 7 days.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-blue-100/60 bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead className="min-w-[240px] font-semibold text-foreground">Email</TableHead>
                  <TableHead className="font-semibold text-foreground">Role</TableHead>
                  <TableHead className="font-semibold text-foreground">Status</TableHead>
                  <TableHead className="font-semibold text-foreground">Expires</TableHead>
                  <TableHead className="text-right font-semibold text-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!loading && invitations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No pending invitations.
                    </TableCell>
                  </TableRow>
                )}
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id} className="border-blue-100/60 hover:bg-blue-50/35">
                    <TableCell className="font-medium text-foreground">{invitation.email}</TableCell>
                    <TableCell><RoleBadge role={invitation.role} /></TableCell>
                    <TableCell>
                      <Badge variant="outline" className={invitation.status === 'expired' ? 'border-amber-100 bg-amber-50 text-amber-700' : 'border-blue-100 bg-blue-50 text-blue-700'}>
                        {invitation.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(invitation.expiresAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <IconAction
                          label="Copy new invite link"
                          icon={<Copy className="h-4 w-4" />}
                          loading={rowActionId === `${invitation.id}:link`}
                          onClick={() => void createInvite(false, invitation)}
                        />
                        <IconAction
                          label="Send invite email"
                          icon={<Send className="h-4 w-4" />}
                          loading={rowActionId === `${invitation.id}:email`}
                          onClick={() => void createInvite(true, invitation)}
                        />
                        <IconAction
                          label="Revoke invitation"
                          icon={<Trash2 className="h-4 w-4" />}
                          loading={rowActionId === `${invitation.id}:revoke`}
                          onClick={() => void revokeInvite(invitation)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="rounded-2xl border-0 bg-white shadow-2xl sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Invite team member</DialogTitle>
            <DialogDescription>
              Invite links are tied to the email address and assigned role.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={inviteRole} onValueChange={(value: TeamRole) => setInviteRole(value)}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['viewer', 'editor', 'admin'] as TeamRole[]).map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleLabels[role]} - {roleDescriptions[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {generatedLink && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                <Label htmlFor="generated-link" className="text-blue-900">Invite link</Label>
                <div className="mt-2 flex gap-2">
                  <Input id="generated-link" value={generatedLink} readOnly className="bg-white" />
                  <Button type="button" variant="outline" size="icon" className="shrink-0 rounded-xl bg-white" onClick={() => void copyText(generatedLink)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-xl" onClick={() => setInviteDialogOpen(false)}>
              Close
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={() => void createInvite(false)} disabled={!!inviteSubmitting}>
              {inviteSubmitting === 'link' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
              Copy Link
            </Button>
            <Button className="rounded-xl" onClick={() => void createInvite(true)} disabled={!!inviteSubmitting}>
              {inviteSubmitting === 'email' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function TeamMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="tool-surface flex items-center gap-3 rounded-xl bg-white px-4 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-primary">{icon}</div>
      <div>
        <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
        <p className="text-lg font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function MemberAvatar({ member }: { member: TeamMember }) {
  if (member.avatarUrl) {
    return <img src={member.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />;
  }

  const initial = (member.name || member.email || '?').charAt(0).toUpperCase();
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shadow-[0_12px_28px_-22px_rgba(37,99,235,0.65)]">
      <span className="text-sm font-medium text-primary">{initial}</span>
    </div>
  );
}

function RoleBadge({ role }: { role: TeamRole }) {
  return (
    <Badge variant="outline" className={`capitalize ${roleStyles[role]}`}>
      {roleLabels[role]}
    </Badge>
  );
}

function IconAction({
  label,
  icon,
  loading,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-blue-50" title={label} onClick={onClick} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : icon}
      <span className="sr-only">{label}</span>
    </Button>
  );
}

function formatDate(value?: string | null) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

async function readFunctionError(error: unknown, fallback: string) {
  const response = (error as { context?: Response })?.context;
  if (response) {
    try {
      const body = await response.clone().json() as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // Keep the original function error message below.
    }
  }

  return error instanceof Error && error.message ? error.message : fallback;
}
