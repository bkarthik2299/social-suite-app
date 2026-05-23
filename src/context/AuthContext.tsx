import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Provider ───────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [membership, setMembership] = useState<OrgMember | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Load the user's organization and membership
    const loadOrgData = async (userId: string) => {
        try {
            setOrganization(null);
            setMembership(null);

            // Get the user's membership (first org they belong to)
            const { data: memberData, error: memberError } = await supabase
                .from('org_members')
                .select('*')
                .eq('user_id', userId)
                .limit(1)
                .maybeSingle();

            if (memberError) throw memberError;

            if (!memberData) {
                return;
            }

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
                const requestId = ++authRequestId;
                
                setSession(newSession);
                setUser(newSession?.user ?? null);
                
                if (newSession?.user) {
                    setIsLoading(true);
                    window.setTimeout(() => {
                        loadOrgData(newSession.user.id).finally(() => {
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
        const { error } = await supabase.auth.signUp({ email, password });
        return { error: error as Error | null };
    };

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error as Error | null };
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setOrganization(null);
        setMembership(null);
    };

    const createOrganization = async (name: string) => {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        const { error } = await supabase
            .from('organizations')
            .insert({ name, slug });

        if (!error && user) {
            // Reload org data (the trigger auto-adds the user as admin)
            await loadOrgData(user.id);
        }

        return { error: error as Error | null };
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
