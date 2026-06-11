import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────

interface Organization {
    id: string;
    name: string;
    slug: string;
    settings: Record<string, unknown>;
}

interface OrgMember {
    id: string;
    org_id: string;
    user_id: string;
    role: 'admin' | 'editor' | 'viewer';
    joined_at: string;
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    organization: Organization | null;
    membership: OrgMember | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signOut: () => Promise<void>;
    createOrganization: (name: string) => Promise<{ error: Error | null }>;
    acceptTeamInvite: (token: string) => Promise<{ error: Error | null; orgId?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const PENDING_TEAM_INVITE_KEY = 'socialsuite.pendingTeamInviteToken';
const ACTIVE_ORG_KEY = 'socialsuite.activeOrgId';

// ── Provider ───────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [membership, setMembership] = useState<OrgMember | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const currentUserIdRef = useRef<string | null>(null);
    const organizationRef = useRef<Organization | null>(null);
    const loadingOrgForUserRef = useRef<string | null>(null);

    useEffect(() => {
        organizationRef.current = organization;
    }, [organization]);

    // Load the user's organization and membership
    const loadOrgData = async (userId: string, preferredOrgId?: string) => {
        try {
            setOrganization(null);
            setMembership(null);

            const activeOrgId = preferredOrgId || window.localStorage.getItem(ACTIVE_ORG_KEY) || '';
            let memberData: OrgMember | null = null;
            let memberError: unknown = null;

            if (activeOrgId) {
                const result = await supabase
                    .from('org_members')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('org_id', activeOrgId)
                    .maybeSingle();
                memberData = result.data as OrgMember | null;
                memberError = result.error;
            }

            // Get the user's membership (preferred org first, then first org they belong to)
            if (!memberData && !memberError) {
                const result = await supabase
                    .from('org_members')
                    .select('*')
                    .eq('user_id', userId)
                    .limit(1)
                    .maybeSingle();
                memberData = result.data as OrgMember | null;
                memberError = result.error;
            }

            if (memberError) throw memberError;

            const pendingInviteToken = window.localStorage.getItem(PENDING_TEAM_INVITE_KEY);
            if (!memberData && pendingInviteToken) {
                const accepted = await acceptTeamInviteToken(pendingInviteToken, userId);
                if (accepted.orgId) return;
            }

            if (!memberData) {
                return;
            }

            window.localStorage.setItem(ACTIVE_ORG_KEY, memberData.org_id);

            setMembership(memberData);

            // Get the organization details
            const { data: orgData, error: orgError } = await supabase
                .from('organizations')
                .select('*')
                .eq('id', memberData.org_id)
                .maybeSingle();

            if (orgError) throw orgError;
            setOrganization(orgData ?? null);
        } catch (err) {
            console.error('Failed to load org data:', err);
            setOrganization(null);
            setMembership(null);
        }
    };

    const acceptTeamInviteToken = async (token: string, userId?: string) => {
        const { data, error } = await supabase.functions.invoke('team-invitations', {
            body: { action: 'accept', token },
        });

        if (error) {
            return { error: error as Error, orgId: undefined };
        }

        const orgId = (data as { org?: { id?: string } } | null)?.org?.id;
        window.localStorage.removeItem(PENDING_TEAM_INVITE_KEY);

        if (orgId) {
            window.localStorage.setItem(ACTIVE_ORG_KEY, orgId);
            if (userId) {
                await loadOrgData(userId, orgId);
            }
        }

        return { error: null, orgId };
    };

    // Listen for auth state changes
    useEffect(() => {
        console.log("AuthContext mounted, setting up auth listeners...");
        
        let isInitialLoad = true;
        let hasAuthCallbackRun = false;
        let authRequestId = 0;
        const timeoutId = setTimeout(() => {
            if (isInitialLoad && !hasAuthCallbackRun) {
                console.warn("Auth initialization timed out. Forcing load completion.");
                setIsLoading(false);
            }
        }, 6000);

        // Subscribe to auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, newSession) => {
                console.log("Auth state change:", event, newSession?.user?.email);

                hasAuthCallbackRun = true;
                const nextUser = newSession?.user ?? null;
                const nextUserId = nextUser?.id ?? null;
                const isSameUser = !!nextUserId && currentUserIdRef.current === nextUserId;
                const isFocusRefreshEvent = event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN';

                if (
                    isFocusRefreshEvent
                    && isSameUser
                    && (organizationRef.current || loadingOrgForUserRef.current === nextUserId)
                ) {
                    setSession(newSession);
                    setUser(nextUser);
                    if (isInitialLoad && organizationRef.current) {
                        isInitialLoad = false;
                        clearTimeout(timeoutId);
                        setIsLoading(false);
                    }
                    return;
                }

                currentUserIdRef.current = nextUserId;
                const requestId = ++authRequestId;
                
                setSession(newSession);
                setUser(nextUser);
                
                if (nextUser) {
                    setIsLoading(true);
                    loadingOrgForUserRef.current = nextUser.id;
                    window.setTimeout(() => {
                        loadOrgData(nextUser.id).finally(() => {
                            if (loadingOrgForUserRef.current === nextUser.id) {
                                loadingOrgForUserRef.current = null;
                            }
                            if (requestId === authRequestId) {
                                if (isInitialLoad) {
                                    isInitialLoad = false;
                                    clearTimeout(timeoutId);
                                }
                                setIsLoading(false);
                            }
                        });
                    }, 0);
                    return;
                } else {
                    currentUserIdRef.current = null;
                    loadingOrgForUserRef.current = null;
                    setOrganization(null);
                    setMembership(null);
                }

                if (requestId === authRequestId) {
                    if (isInitialLoad) {
                        isInitialLoad = false;
                        clearTimeout(timeoutId);
                    }
                    setIsLoading(false);
                }
            }
        );

        return () => {
            clearTimeout(timeoutId);
            subscription.unsubscribe();
        };
    }, []);

    // ── Auth Methods ─────────────────────────────────────────────────

    const signUp = async (email: string, password: string) => {
        const pendingInviteToken = window.localStorage.getItem(PENDING_TEAM_INVITE_KEY);
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: pendingInviteToken
                ? { emailRedirectTo: `${window.location.origin}/invite/${pendingInviteToken}` }
                : undefined,
        });
        return { error: error as Error | null };
    };

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error as Error | null };
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        window.localStorage.removeItem(ACTIVE_ORG_KEY);
        setOrganization(null);
        setMembership(null);
    };

    const createOrganization = async (name: string) => {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        const { data, error } = await supabase
            .from('organizations')
            .insert({ name, slug })
            .select('id')
            .single();

        if (!error && user) {
            if (data?.id) window.localStorage.setItem(ACTIVE_ORG_KEY, data.id);
            // Reload org data (the trigger auto-adds the user as admin)
            await loadOrgData(user.id, data?.id);
        }

        return { error: error as Error | null };
    };

    const acceptTeamInvite = async (token: string) => {
        window.localStorage.setItem(PENDING_TEAM_INVITE_KEY, token);
        const { data } = await supabase.auth.getUser();
        if (!data.user) return { error: null, orgId: undefined };
        return acceptTeamInviteToken(token, data.user.id);
    };

    return (
        <AuthContext.Provider value={{
            user,
            session,
            organization,
            membership,
            isLoading,
            isAuthenticated: !!user,
            signUp,
            signIn,
            signOut,
            createOrganization,
            acceptTeamInvite,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
