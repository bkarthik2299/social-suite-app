import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, KeyRound, Loader2, Mail, ShieldCheck, Users } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

type InviteRole = 'admin' | 'editor' | 'viewer';

interface InvitationDetails {
  email: string;
  role: InviteRole;
  expiresAt: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
}

const PENDING_TEAM_INVITE_KEY = 'socialsuite.pendingTeamInviteToken';
const ACTIVE_ORG_KEY = 'socialsuite.activeOrgId';

const roleLabels: Record<InviteRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export default function InviteAccept() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signIn, signUp, signOut, acceptTeamInvite, isLoading: authLoading } = useAuth();

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [lookupLoading, setLookupLoading] = useState(true);
  const [lookupError, setLookupError] = useState('');
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] = useState(false);

  const invitedEmail = invitation?.email || '';
  const signedInEmail = user?.email?.toLowerCase() || '';
  const isSignedInAsInvitee = !!user && !!invitedEmail && signedInEmail === invitedEmail.toLowerCase();
  const needsPasswordSetup = useMemo(() => {
    const url = `${window.location.search}${window.location.hash}`;
    return /type=invite|team_invitation/i.test(url);
  }, []);

  useEffect(() => {
    if (!token) {
      setLookupError('This invitation link is missing its token.');
      setLookupLoading(false);
      return;
    }

    window.localStorage.setItem(PENDING_TEAM_INVITE_KEY, token);

    let isMounted = true;
    setLookupLoading(true);
    setLookupError('');

    supabase.functions
      .invoke('team-invitations', { body: { action: 'lookup', token } })
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          void readFunctionError(error, 'This invitation could not be loaded.').then((message) => {
            if (isMounted) setLookupError(message);
          });
          return;
        }
        const details = (data as { invitation?: InvitationDetails } | null)?.invitation;
        if (!details) {
          setLookupError('This invitation is invalid or has expired.');
          return;
        }
        setInvitation(details);
      })
      .catch((error) => {
        if (isMounted) setLookupError(error instanceof Error ? error.message : 'This invitation could not be loaded.');
      })
      .finally(() => {
        if (isMounted) setLookupLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  const validatePassword = (requireConfirmation: boolean) => {
    if (password.length < 6) {
      toast({ variant: 'destructive', title: 'Password must be at least 6 characters' });
      return false;
    }
    if (requireConfirmation && password !== confirmPassword) {
      toast({ variant: 'destructive', title: 'Passwords do not match' });
      return false;
    }
    return true;
  };

  const finishAccept = async () => {
    if (!token) return;

    setSubmitting(true);
    try {
      if (needsPasswordSetup) {
        if (!validatePassword(true)) return;
        const { error: passwordError } = await supabase.auth.updateUser({ password });
        if (passwordError) {
          toast({ variant: 'destructive', title: 'Could not set password', description: passwordError.message });
          return;
        }
      }

      const { error, orgId } = await acceptTeamInvite(token);
      if (error) {
        toast({ variant: 'destructive', title: 'Could not accept invitation', description: error.message });
        return;
      }

      if (orgId) window.localStorage.setItem(ACTIVE_ORG_KEY, orgId);
      window.localStorage.removeItem(PENDING_TEAM_INVITE_KEY);
      toast({ title: 'Welcome to the team', description: invitation ? `You joined ${invitation.organization.name}.` : undefined });
      navigate('/', { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!invitation) return;
    if (!validatePassword(mode === 'signup')) return;

    setSubmitting(true);
    try {
      const result = mode === 'signin'
        ? await signIn(invitation.email, password)
        : await signUp(invitation.email, password);

      if (result.error) {
        toast({
          variant: 'destructive',
          title: mode === 'signin' ? 'Sign in failed' : 'Sign up failed',
          description: result.error.message,
        });
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setAwaitingEmailConfirmation(true);
        toast({ title: 'Check your email', description: 'Confirm your account, then this invite will finish automatically.' });
        return;
      }

      await finishAccept();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1fr_420px] lg:items-center">
          <div className="space-y-6">
            <Link to="/auth" className="inline-flex items-center text-sm font-semibold text-primary hover:text-primary/80">
              socialsuite.
            </Link>

            <div className="max-w-2xl space-y-4">
              <Badge className="border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-50">
                <Users className="mr-1.5 h-3.5 w-3.5" />
                Team invitation
              </Badge>
              <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                Join your workspace
              </h1>
              <p className="max-w-xl text-base leading-7 text-slate-600">
                Accept the invitation with the email address it was sent to. Your account will be added to the organization with the assigned access level.
              </p>
            </div>
          </div>

          <Card className="border-slate-200 bg-white shadow-xl shadow-slate-200/60">
            <CardHeader className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-primary">
                {lookupLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : lookupError ? <AlertCircle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
              </div>
              <div>
                <CardTitle>{lookupError ? 'Invitation unavailable' : invitation?.organization.name || 'Loading invitation'}</CardTitle>
                <CardDescription>
                  {lookupError || (invitation ? `${roleLabels[invitation.role]} access for ${invitation.email}` : 'Checking this invite link.')}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent>
              {lookupLoading && (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading invitation details
                </div>
              )}

              {!lookupLoading && lookupError && (
                <Button asChild className="w-full rounded-xl">
                  <Link to="/auth">Go to sign in</Link>
                </Button>
              )}

              {!lookupLoading && invitation && awaitingEmailConfirmation && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                    <Mail className="mb-2 h-5 w-5" />
                    Confirm your email for {invitation.email}. After confirmation, return to this invite link to finish joining {invitation.organization.name}.
                  </div>
                  <Button variant="outline" className="w-full rounded-xl" onClick={() => setAwaitingEmailConfirmation(false)}>
                    Back
                  </Button>
                </div>
              )}

              {!lookupLoading && invitation && !awaitingEmailConfirmation && user && !isSignedInAsInvitee && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    This invite is for {invitation.email}, but you are signed in as {user.email}. Sign out and use the invited email to continue.
                  </div>
                  <Button variant="outline" className="w-full rounded-xl" onClick={() => void signOut()}>
                    Sign out
                  </Button>
                </div>
              )}

              {!lookupLoading && invitation && !awaitingEmailConfirmation && isSignedInAsInvitee && (
                <div className="space-y-5">
                  <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-500">Organization</span>
                      <span className="font-medium text-slate-900">{invitation.organization.name}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-500">Role</span>
                      <Badge variant="outline" className="bg-white capitalize">{invitation.role}</Badge>
                    </div>
                  </div>

                  {needsPasswordSetup && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                        <KeyRound className="h-4 w-4 text-primary" />
                        Set your password
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="invite-password">Password</Label>
                        <Input id="invite-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="invite-confirm-password">Confirm password</Label>
                        <Input id="invite-confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                      </div>
                    </div>
                  )}

                  <Button className="w-full rounded-xl" onClick={() => void finishAccept()} disabled={submitting || authLoading}>
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Accept invitation
                  </Button>
                </div>
              )}

              {!lookupLoading && invitation && !awaitingEmailConfirmation && !user && (
                <form className="space-y-4" onSubmit={handleAuthSubmit}>
                  <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setMode('signup')}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${mode === 'signup' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
                    >
                      Sign up
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('signin')}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${mode === 'signin' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
                    >
                      Sign in
                    </button>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invite-email">Email</Label>
                    <Input id="invite-email" type="email" value={invitation.email} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-auth-password">Password</Label>
                    <Input id="invite-auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                  </div>
                  {mode === 'signup' && (
                    <div className="space-y-2">
                      <Label htmlFor="invite-auth-confirm-password">Confirm password</Label>
                      <Input id="invite-auth-confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
                    </div>
                  )}

                  <Button type="submit" className="w-full rounded-xl" disabled={submitting || authLoading}>
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                    {mode === 'signup' ? 'Create account and join' : 'Sign in and join'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
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
