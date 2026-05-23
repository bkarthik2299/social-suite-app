import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function AuthPage() {
    const { signIn, signUp, createOrganization, isAuthenticated, organization } = useAuth();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [isLogin, setIsLogin] = useState(true);

    // Form state
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    
    // Org creation state
    const [orgName, setOrgName] = useState('');

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        const { error } = await signIn(email, password);
        setIsLoading(false);
        if (error) {
            toast({ variant: 'destructive', title: 'Sign in failed', description: error.message });
        }
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            toast({ variant: 'destructive', title: 'Passwords do not match' });
            return;
        }
        if (password.length < 6) {
            toast({ variant: 'destructive', title: 'Password must be at least 6 characters' });
            return;
        }
        setIsLoading(true);
        const { error } = await signUp(email, password);
        setIsLoading(false);
        if (error) {
            toast({ variant: 'destructive', title: 'Sign up failed', description: error.message });
        } else {
            toast({ title: 'Account created!', description: 'Please check your email to confirm your account.' });
        }
    };

    const handleCreateOrg = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgName.trim()) return;
        setIsLoading(true);
        const { error } = await createOrganization(orgName.trim());
        setIsLoading(false);
        if (error) {
            toast({ variant: 'destructive', title: 'Failed to create organization', description: error.message });
        } else {
            toast({ title: 'Organization created!', description: `Welcome to ${orgName}` });
        }
    };

    // If authenticated but no org, show org creation
    if (isAuthenticated && !organization) {
        return (
            <div className="min-h-screen w-full relative overflow-hidden bg-gradient-to-br from-[#62aaff] via-[#e6f2ff] to-[#429dff] flex items-center justify-center p-4">
                <Card className="w-full max-w-[450px] bg-white/95 backdrop-blur-sm border-white/20 shadow-2xl rounded-[2rem] p-6 sm:p-10 relative">
                    <CardHeader className="text-center space-y-3 px-0 pt-0">
                        <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center border border-blue-100">
                            <Building2 className="w-8 h-8 text-[#007AFF]" />
                        </div>
                        <CardTitle className="text-2xl font-bold text-slate-900">Create Organization</CardTitle>
                        <CardDescription className="text-slate-500">
                            Set up your agency workspace to get started
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                        <form onSubmit={handleCreateOrg} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="org-name" className="text-slate-700">Organization Name</Label>
                                <Input
                                    id="org-name"
                                    placeholder="e.g. My Agency"
                                    value={orgName}
                                    onChange={(e) => setOrgName(e.target.value)}
                                    className="bg-slate-50/50 border-slate-200 focus:border-slate-300 focus:ring-0"
                                    required
                                />
                            </div>
                            <Button
                                type="submit"
                                className="w-full bg-[#007AFF] hover:bg-blue-600 text-white shadow-md rounded-xl h-11"
                                disabled={isLoading}
                            >
                                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Building2 className="w-4 h-4 mr-2" />}
                                Create Organization
                            </Button>
                            
                            <div className="pt-2 text-center">
                                <button 
                                    type="button"
                                    onClick={() => signOut()}
                                    className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
                                >
                                    Log out and use a different account
                                </button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Auth form (sign in / sign up)
    return (
        <div className="min-h-screen w-full relative overflow-hidden bg-gradient-to-br from-[#77bfff] via-[#eef6ff] to-[#51a1ff] animate-gradient-flow flex">
            <style>{`
                @keyframes gradient-flow {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                @keyframes logo-levitate {
                    0%, 100% {
                        transform: translate3d(0, 0, 0) scale(1);
                    }
                    50% {
                        transform: translate3d(0, -14px, 0) scale(1.012);
                    }
                }
                .animate-gradient-flow {
                    background-size: 200% 200%;
                    animation: gradient-flow 12s ease infinite;
                }
                .animate-logo-levitate {
                    animation: logo-levitate 7s ease-in-out infinite;
                    will-change: transform;
                }
            `}</style>
            
            {/* Background Logo Container */}
            <div className="hidden lg:flex absolute left-0 top-0 bottom-0 w-[55%] items-center justify-center z-0 pointer-events-none">
                <div className="relative w-full h-full flex items-center justify-center">
                    {/* Subtle thin blue gradient line separator */}
                    <div className="absolute right-0 top-[15%] bottom-[15%] w-[1px] bg-gradient-to-b from-transparent via-[#a0cdff] to-transparent opacity-60"></div>
                    
                    <img 
                        src="/logo-white.png" 
                        alt="Background Logo" 
                        className="w-[60%] max-w-[500px] object-contain opacity-[0.85] transition-transform duration-1000 animate-logo-levitate"
                        style={{ filter: 'drop-shadow(0 15px 35px rgba(0, 0, 0, 0.08))' }}
                    />
                </div>
            </div>

            <div className="w-full h-screen flex items-center justify-center lg:justify-end px-4 lg:pr-[8%] xl:pr-[12%] z-10">
                <Card className="w-full max-w-[460px] bg-white border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-[2rem] p-8 sm:p-10 relative">
                    <div className="absolute top-8 right-8">
                        <span className="font-extrabold text-xl tracking-tight text-slate-900">socialsuite.</span>
                    </div>

                    <CardContent className="p-0 pt-14">
                        <div className="space-y-1.5 mb-7">
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900 leading-none transition-all">
                                {isLogin ? 'Welcome back' : 'Create account'}
                            </h1>
                            <p className="text-slate-500 text-[15px]">
                                {isLogin ? 'Enter your details to access your account' : 'Join Social Suite to get started'}
                            </p>
                        </div>

                        {/* Fluid Toggle Segmented Control */}
                        <div className="bg-slate-100/80 p-1 rounded-xl flex mb-6 relative">
                            <button 
                                type="button"
                                onClick={() => setIsLogin(true)}
                                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300 z-10 ${isLogin ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Login
                            </button>
                            <button 
                                type="button"
                                onClick={() => setIsLogin(false)}
                                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300 z-10 ${!isLogin ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Sign up
                            </button>
                            {/* Sliding background indicator */}
                            <div 
                                className="absolute top-1 bottom-1 w-[calc(50%-0.25rem)] bg-white rounded-lg shadow-sm transition-all duration-300 ease-out z-0"
                                style={{ transform: isLogin ? 'translateX(0)' : 'translateX(100%)' }}
                            ></div>
                        </div>

                        <form onSubmit={isLogin ? handleSignIn : handleSignUp} className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="email" className="text-slate-700 font-medium text-[13px]">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="John Doe"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="bg-slate-50/80 border-slate-200 focus:border-slate-300 focus:ring-0 h-11"
                                    required
                                />
                            </div>
                            
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password" className="text-slate-700 font-medium text-[13px]">Password</Label>
                                    <div className={`transition-opacity duration-300 ${isLogin ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                        <a href="#" className="text-xs font-semibold text-[#007AFF] hover:underline">
                                            Forgot password?
                                        </a>
                                    </div>
                                </div>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="bg-slate-50/80 border-slate-200 focus:border-slate-300 focus:ring-0 h-11"
                                    required
                                />
                            </div>

                            {/* Confirm Password with fluid transition */}
                            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isLogin ? 'max-h-0 opacity-0' : 'max-h-[100px] opacity-100'}`}>
                                <div className="space-y-1.5 pt-1">
                                    <Label htmlFor="confirm-password" className="text-slate-700 font-medium text-[13px]">Confirm Password</Label>
                                    <Input
                                        id="confirm-password"
                                        type="password"
                                        placeholder="Confirm Password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="bg-slate-50/80 border-slate-200 focus:border-slate-300 focus:ring-0 h-11"
                                        required={!isLogin}
                                    />
                                </div>
                            </div>

                            <div className="pt-3">
                                <Button
                                    type="submit"
                                    className="w-full bg-[#007AFF] hover:bg-blue-600 text-white shadow-sm rounded-xl h-[46px] font-semibold text-[15px] transition-colors"
                                    disabled={isLoading}
                                >
                                    {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    {isLogin ? 'Login' : 'Sign Up'}
                                </Button>
                            </div>
                        </form>

                        <div className="mt-5">
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full bg-[#f4f8fc] hover:bg-[#ebf3fa] border-transparent text-slate-700 rounded-xl h-[46px] font-semibold text-[15px] transition-colors"
                                onClick={() => toast({ title: 'Google Sign In', description: 'Coming soon!' })}
                            >
                                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                                Continue with Google
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
