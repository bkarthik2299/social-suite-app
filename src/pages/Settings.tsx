import React, { useEffect, useRef, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, KeyRound, Loader2, Camera, Trash2, Upload } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    createAccountApiKey,
    listAccountApiKeys,
    revokeAccountApiKey,
    type AccountApiKey,
    type AccountApiKeyPermission,
} from '@/services/accountApiKeys';

export default function Settings() {
    const { user, organization } = useAuth();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');
    const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata?.avatar_url || '');
    const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [apiKeys, setApiKeys] = useState<AccountApiKey[]>([]);
    const [isLoadingKeys, setIsLoadingKeys] = useState(false);
    const [isCreatingKey, setIsCreatingKey] = useState(false);
    const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
    const [keyName, setKeyName] = useState('');
    const [keyPermission, setKeyPermission] = useState<AccountApiKeyPermission>('read');
    const [newApiSecret, setNewApiSecret] = useState('');

    const getErrorMessage = (error: unknown) => {
        return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
    };

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

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsUpdatingProfile(true);
        try {
            const { error } = await supabase.auth.updateUser({
                data: { full_name: fullName }
            });
            if (error) throw error;
            toast({ title: 'Profile updated', description: 'Your profile has been successfully updated.' });
        } catch (error: unknown) {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        } finally {
            setIsUpdatingProfile(false);
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Basic validation
        if (!file.type.startsWith('image/')) {
            toast({ variant: 'destructive', title: 'Invalid file', description: 'Please upload an image file.' });
            return;
        }

        setIsUploadingAvatar(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${user?.id}-${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) {
                // If bucket doesn't exist, inform user
                if (uploadError.message.includes('bucket not found')) {
                    throw new Error('Storage bucket "avatars" not found. Please create it in your Supabase dashboard.');
                }
                throw uploadError;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            const { error: updateError } = await supabase.auth.updateUser({
                data: { avatar_url: publicUrl }
            });

            if (updateError) throw updateError;

            setAvatarUrl(publicUrl);
            toast({ title: 'Avatar updated', description: 'Your profile picture has been updated.' });
        } catch (error: unknown) {
            toast({ variant: 'destructive', title: 'Upload failed', description: getErrorMessage(error) });
        } finally {
            setIsUploadingAvatar(false);
        }
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            toast({ variant: 'destructive', title: 'Error', description: 'Passwords do not match.' });
            return;
        }
        if (newPassword.length < 6) {
            toast({ variant: 'destructive', title: 'Error', description: 'Password must be at least 6 characters.' });
            return;
        }

        setIsUpdatingPassword(true);
        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });
            if (error) throw error;
            toast({ title: 'Password updated', description: 'Your password has been successfully updated.' });
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: unknown) {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    const handleCreateApiKey = async (e: React.FormEvent) => {
        e.preventDefault();
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
            setKeyName('');
            setKeyPermission('read');
            toast({ title: 'API key created', description: 'Copy it now. You will not be able to see it again.' });
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

    const copyApiKey = async (value: string) => {
        await navigator.clipboard.writeText(value);
        toast({ title: 'Copied' });
    };

    const formatDate = (value?: string | null) => value
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
        : 'Never';

    return (
        <AppLayout breadcrumbs={[{ label: 'Settings', path: '/settings' }]}>
            <div className="max-w-2xl mx-auto space-y-6 mt-6 pb-12">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Account Settings</h1>
                    <p className="text-slate-500">Manage your profile and security preferences.</p>
                </div>

                <Card className="border-slate-200 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b">
                        <CardTitle>Profile Icon</CardTitle>
                        <CardDescription>Change your public profile picture.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-6">
                            <div className="relative group">
                                <Avatar className="w-24 h-24 border-2 border-white shadow-md">
                                    <AvatarImage src={avatarUrl} />
                                    <AvatarFallback className="bg-blue-50 text-[#007AFF] text-2xl font-bold">
                                        {fullName.charAt(0) || user?.email?.charAt(0) || 'U'}
                                    </AvatarFallback>
                                </Avatar>
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                    disabled={isUploadingAvatar}
                                >
                                    <Camera className="w-8 h-8 text-white" />
                                </button>
                                {isUploadingAvatar && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-full">
                                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                                    </div>
                                )}
                            </div>
                            <div className="space-y-3">
                                <h3 className="font-medium text-slate-900">Public Avatar</h3>
                                <p className="text-sm text-slate-500 max-w-xs">
                                    Click the avatar to upload a new image. JPG, PNG or GIF. Max 2MB.
                                </p>
                                <div className="flex gap-2">
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        className="hidden" 
                                        accept="image/*"
                                        onChange={handleAvatarUpload}
                                    />
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploadingAvatar}
                                    >
                                        <Upload className="w-4 h-4 mr-2" />
                                        Upload Image
                                    </Button>
                                    {avatarUrl && (
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                            onClick={async () => {
                                                await supabase.auth.updateUser({ data: { avatar_url: null } });
                                                setAvatarUrl('');
                                                toast({ title: 'Avatar removed' });
                                            }}
                                        >
                                            Remove
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                        <CardTitle>Profile Details</CardTitle>
                        <CardDescription>Update your personal information.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleUpdateProfile} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" value={user?.email || ''} disabled className="bg-slate-50 cursor-not-allowed" />
                                <p className="text-xs text-slate-500">Your email address cannot be changed here.</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="fullName">Full Name</Label>
                                <Input 
                                    id="fullName" 
                                    value={fullName} 
                                    onChange={(e) => setFullName(e.target.value)} 
                                    placeholder="e.g. Leo Parthiban"
                                />
                            </div>
                            <Button type="submit" disabled={isUpdatingProfile} className="bg-[#007AFF] hover:bg-blue-600 text-white">
                                {isUpdatingProfile && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Save Changes
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                        <CardTitle>Change Password</CardTitle>
                        <CardDescription>Update your password to keep your account secure.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleUpdatePassword} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="newPassword">New Password</Label>
                                <Input 
                                    id="newPassword" 
                                    type="password" 
                                    value={newPassword} 
                                    onChange={(e) => setNewPassword(e.target.value)} 
                                    placeholder="Enter new password"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">Confirm Password</Label>
                                <Input 
                                    id="confirmPassword" 
                                    type="password" 
                                    value={confirmPassword} 
                                    onChange={(e) => setConfirmPassword(e.target.value)} 
                                    placeholder="Confirm new password"
                                    required
                                />
                            </div>
                            <Button type="submit" disabled={isUpdatingPassword} variant="outline" className="border-[#007AFF] text-[#007AFF] hover:bg-blue-50">
                                {isUpdatingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Update Password
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                    <CardHeader>
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-lg border border-blue-100 bg-blue-50 p-2 text-[#007AFF]">
                                <KeyRound className="h-4 w-4" />
                            </div>
                            <div>
                                <CardTitle>Agent API Keys</CardTitle>
                                <CardDescription>Create keys for MCP connectors and agent tools.</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <form onSubmit={handleCreateApiKey} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
                            <div className="space-y-2">
                                <Label htmlFor="apiKeyName">Key Name</Label>
                                <Input
                                    id="apiKeyName"
                                    value={keyName}
                                    onChange={(event) => setKeyName(event.target.value)}
                                    placeholder="e.g. Hermes Desktop"
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
                                        <SelectItem value="read">Read</SelectItem>
                                        <SelectItem value="write">Write</SelectItem>
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
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Copy Your API Key</DialogTitle>
                        <DialogDescription>This key is shown once. Store it somewhere secure before closing this window.</DialogDescription>
                    </DialogHeader>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm break-all text-slate-800">
                        {newApiSecret}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => copyApiKey(newApiSecret)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy
                        </Button>
                        <Button type="button" className="bg-[#007AFF] text-white hover:bg-blue-600" onClick={() => setNewApiSecret('')}>
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
