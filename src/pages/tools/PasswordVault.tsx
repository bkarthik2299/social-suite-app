
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { AppLayout } from '@/components/layout/AppLayout';
import { useVault, useProjects } from '@/hooks/useDatabase';
import { encryptString, decryptString } from '@/lib/encryption';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FolderOpen } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Search, Plus, ShieldCheck, Eye, EyeOff, Copy, Trash2,
    ExternalLink, Facebook, Instagram, Globe, KeyRound, RefreshCw
} from 'lucide-react';
import { cn } from "@/lib/utils";

// --- Types ---
type Credential = {
    id: string;
    service_name: string;
    username: string;
    encrypted_password: string;
    url?: string | null;
    color_class?: string | null;
    category?: string | null;
    project_id?: string | null;
};

type CredentialForm = {
    serviceName: string;
    username: string;
    password: string;
    url?: string;
    colorClass?: string;
};

// --- Mock Data ---
const initialCredentials: Credential[] = [];

// --- Password Generator Component ---
const PasswordGenerator = ({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) => {
    const [length, setLength] = useState(12);
    const [options, setOptions] = useState({
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
        excludeAmbiguous: false
    });
    const [generatedPassword, setGeneratedPassword] = useState('');
    const { toast } = useToast();

    const generate = () => {
        const uppercaseChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const lowercaseChars = 'abcdefghijklmnopqrstuvwxyz';
        const numberChars = '0123456789';
        const symbolChars = '!@#$%^&*()_+~`|}{[]:;?><,./-=';
        const ambiguousChars = '0O1Il5S';

        let chars = '';
        if (options.uppercase) chars += uppercaseChars;
        if (options.lowercase) chars += lowercaseChars;
        if (options.numbers) chars += numberChars;
        if (options.symbols) chars += symbolChars;

        if (options.excludeAmbiguous) {
            chars = chars.split('').filter(c => !ambiguousChars.includes(c)).join('');
        }

        if (chars.length === 0) return;

        let password = '';
        for (let i = 0; i < length; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setGeneratedPassword(password);
    };

    useEffect(() => {
        if (open) generate();
    }, [open]);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedPassword);
        toast({ title: "Copied!", description: "Password copied to clipboard." });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-blue-500" />
                        Generate Strong Password
                    </DialogTitle>
                    <DialogDescription>Choose password rules, then copy the generated password into a credential.</DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                    <div className="relative">
                        <div className="h-14 bg-slate-100 rounded-lg flex items-center justify-center text-xl font-mono tracking-wider font-semibold px-12 break-all text-center">
                            {generatedPassword}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 hover:bg-slate-200"
                            onClick={() => generate()}
                            title="Regenerate"
                            aria-label="Regenerate password"
                        >
                            <RefreshCw className="w-4 h-4 text-slate-500" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute left-2 top-1/2 -translate-y-1/2 hover:bg-slate-200"
                            onClick={copyToClipboard}
                            title="Copy"
                            aria-label="Copy generated password"
                        >
                            <Copy className="w-4 h-4 text-slate-500" />
                        </Button>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between">
                            <Label>Password Length</Label>
                            <span className="font-mono font-medium">{length}</span>
                        </div>
                        <Slider
                            value={[length]}
                            onValueChange={(vals) => setLength(vals[0])}
                            min={8}
                            max={64}
                            step={1}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="uppercase"
                                checked={options.uppercase}
                                onCheckedChange={(checked) => setOptions({ ...options, uppercase: checked as boolean })}
                            />
                            <Label htmlFor="uppercase">A-Z (Uppercase)</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="lowercase"
                                checked={options.lowercase}
                                onCheckedChange={(checked) => setOptions({ ...options, lowercase: checked as boolean })}
                            />
                            <Label htmlFor="lowercase">a-z (Lowercase)</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="numbers"
                                checked={options.numbers}
                                onCheckedChange={(checked) => setOptions({ ...options, numbers: checked as boolean })}
                            />
                            <Label htmlFor="numbers">0-9 (Numbers)</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="symbols"
                                checked={options.symbols}
                                onCheckedChange={(checked) => setOptions({ ...options, symbols: checked as boolean })}
                            />
                            <Label htmlFor="symbols">!@#$% (Symbols)</Label>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={copyToClipboard} className="w-full">Copy Password</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// --- Credential Dialog (Add/Edit) ---
const CredentialDialog = ({
    open,
    onOpenChange,
    onSave,
    initialData,
    onGenerate,
    projects
}: {
    open: boolean,
    onOpenChange: (open: boolean) => void,
    onSave: (cred: Partial<Credential> & { serviceName: string, username: string, password: string }) => void,
    initialData?: Credential | null,
    onGenerate: () => void,
    projects: Array<{ id: string, name: string }>
}) => {
    const [formData, setFormData] = useState({
        serviceName: '',
        url: '',
        username: '',
        password: '',
        color: 'blue',
        projectId: ''
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                serviceName: initialData.service_name,
                url: initialData.url || '',
                username: initialData.username,
                password: decryptString(initialData.encrypted_password),
                color: 'blue',
                projectId: initialData.project_id || ''
            });
        } else {
            setFormData({ serviceName: '', url: '', username: '', password: '', color: 'blue', projectId: '' });
        }
    }, [initialData, open]);

    const handleSubmit = () => {
        if (!formData.serviceName || !formData.username || !formData.password) return;

        let colorClass = 'bg-slate-900';
        // "Safe" color palette (Blues, Teals, Indigos, Violets) - No Reds/Oranges
        const safeColors = [
            'bg-blue-600',
            'bg-indigo-600',
            'bg-violet-600',
            'bg-teal-600',
            'bg-cyan-600',
            'bg-sky-600',
            'bg-slate-700'
        ];

        // Deterministic color based on service name length (or random if preferred)
        const colorIndex = formData.serviceName.length % safeColors.length;
        colorClass = safeColors[colorIndex];

        // Specific overrides for major brands (using safe approximations)
        if (formData.serviceName.toLowerCase().includes('instagram')) colorClass = 'bg-gradient-to-tr from-purple-600 to-pink-600'; // Kept slightly vibrant but cooler
        else if (formData.serviceName.toLowerCase().includes('facebook')) colorClass = 'bg-blue-700';
        else if (formData.serviceName.toLowerCase().includes('netflix')) colorClass = 'bg-slate-900'; // Black instead of Red
        else if (formData.serviceName.toLowerCase().includes('youtube')) colorClass = 'bg-slate-800'; // Dark instead of Red

        onSave({
            ...formData,
            projectId: formData.projectId || undefined, // Don't save empty string
            // icon: Globe, // Removed icon default
            colorClass
        });
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Update Credential' : 'Add New Credential'}</DialogTitle>
                    <DialogDescription>Save the service, login, password, and optional project association.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="grid gap-2">
                        <Label>Service Name (Required)</Label>
                        <Input
                            placeholder="e.g. Netflix"
                            value={formData.serviceName}
                            onChange={e => setFormData({ ...formData, serviceName: e.target.value })}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label>Website URL</Label>
                        <Input
                            placeholder="https://..."
                            value={formData.url}
                            onChange={e => setFormData({ ...formData, url: e.target.value })}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label>Username / Email (Required)</Label>
                        <Input
                            placeholder="email@example.com"
                            value={formData.username}
                            onChange={e => setFormData({ ...formData, username: e.target.value })}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label>Password (Required)</Label>
                        <div className="relative">
                            <Input
                                type="text"
                                placeholder="********"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                            />
                            <Button
                                size="sm"
                                variant="ghost"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7"
                                onClick={onGenerate}
                                title="Generate Password"
                                aria-label="Generate password"
                            >
                                <KeyRound className="w-4 h-4 text-muted-foreground" />
                            </Button>
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <Label>Assign to Project (Optional)</Label>
                        <Select
                            value={formData.projectId}
                            onValueChange={(val) => setFormData({ ...formData, projectId: val })}
                        >
                            <SelectTrigger aria-label="Assign to project">
                                <SelectValue placeholder="Select a project..." />
                            </SelectTrigger>
                            <SelectContent>
                                {projects.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSubmit}>{initialData ? 'Update' : 'Save Credential'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// --- Main Page Component ---
const PasswordVault = () => {
    const { data: projects = [] } = useProjects();
    const { data: dbCredentials, isLoading, addCredential, updateCredential, deleteCredential } = useVault();
    const credentials = (dbCredentials as Credential[]) || [];
    const [searchQuery, setSearchQuery] = useState('');
    const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);

    // Dialog States
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCredential, setEditingCredential] = useState<Credential | null>(null);

    // Delete Alert State
    const [deleteId, setDeleteId] = useState<string | null>(null);

    // Visibility State
    const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
    const { toast } = useToast();

    const toggleVisibility = (id: string) => {
        setVisiblePasswords(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: "Copied!", description: `${label} copied to clipboard.` });
    };

    const confirmDelete = () => {
        if (deleteId) {
            deleteCredential.mutate(deleteId);
            toast({ title: "Deleted", description: "Credential deleted." });
            setDeleteId(null);
        }
    };

    const handleSave = (data: CredentialForm) => {
        const payload = {
            service_name: data.serviceName,
            username: data.username,
            encrypted_password: encryptString(data.password),
            url: data.url || null,
            color_class: data.colorClass || null,
            project_id: data.projectId || null,
        };

        if (editingCredential) {
            updateCredential.mutate({ id: editingCredential.id, updates: payload });
            toast({ title: "Updated", description: "Credential updated successfully." });
        } else {
            addCredential.mutate(payload);
            toast({ title: "Success", description: "New credential added." });
        }
        setIsDialogOpen(false);
        setEditingCredential(null);
    };

    const openAddDialog = () => {
        setEditingCredential(null);
        setIsDialogOpen(true);
    };

    const openEditDialog = (cred: Credential) => {
        setEditingCredential(cred);
        setIsDialogOpen(true);
    };

    const filteredCredentials = credentials.filter(c =>
        c.service_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.username.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const hasSearchQuery = searchQuery.trim().length > 0;

    return (
        <AppLayout breadcrumbs={[{ label: 'Tools', path: '#' }, { label: 'Password Vault', path: '/tools/vault' }]}>
            <div className="space-y-8 max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Credentials Vault</h1>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <Button variant="outline" className="tool-surface tool-surface-interactive gap-2 rounded-full px-6 hover:bg-white" onClick={() => setIsGeneratorOpen(true)}>
                            <ShieldCheck className="w-4 h-4 text-blue-600" />
                            Generate Password
                        </Button>
                        <Button className="gap-2 rounded-full bg-primary hover:bg-primary/90 text-white px-6" onClick={openAddDialog}>
                            <Plus className="w-4 h-4" />
                            Add New Credential
                        </Button>
                    </div>
                </div>

                {/* Search */}
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search Credentials..."
                        className="tool-surface h-10 rounded-xl pl-10 text-sm"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {isLoading ? (
                        <div className="col-span-full py-12 flex justify-center">
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : filteredCredentials.map(cred => {
                        const isVisible = visiblePasswords[cred.id];

                        return (
                            <Card
                                key={cred.id}
                                className="tool-surface tool-surface-interactive group relative overflow-hidden rounded-xl"
                            >
                                <CardContent className="p-5">
                                    {/* Minimal Header Row */}
                                    <div className="flex items-start justify-between mb-6">
                                        <div className="flex items-center gap-4">
                                            {/* Minimalist Avatar */}
                                            <div className={cn(
                                                "h-12 w-12 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-sm",
                                                cred.color_class || 'bg-slate-900'
                                            )}>
                                                {cred.service_name.charAt(0).toUpperCase()}
                                            </div>

                                            <div className="flex flex-col">
                                                <h3 className="font-semibold text-lg text-slate-900 leading-tight">{cred.service_name}</h3>
                                                {cred.project_id && (
                                                    <span className="flex items-center gap-1 text-[10px] text-slate-500 font-medium uppercase tracking-wider mt-0.5">
                                                        <FolderOpen className="w-3 h-3" />
                                                        {projects.find(p => p.id === cred.project_id)?.name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1">
                                            {cred.url && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                                                    asChild
                                                >
                                                    <a href={cred.url} target="_blank" rel="noreferrer" aria-label={`Open ${cred.service_name}`}>
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                onClick={() => setDeleteId(cred.id)}
                                                aria-label={`Delete ${cred.service_name}`}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Fields */}
                                    <div className="space-y-3">
                                        {/* Username Group */}
                                        <div className="space-y-1">
                                            <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider pl-1">Username</Label>
                                            <div className="flex items-center justify-between rounded-lg bg-slate-50/70 p-2.5 transition-colors group/field hover:bg-blue-50/45">
                                                <span className="text-sm font-medium text-slate-700 truncate select-all">{cred.username}</span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-slate-400 hover:text-primary rounded opacity-0 group-hover/field:opacity-100 transition-opacity"
                                                    onClick={() => copyToClipboard(cred.username, "Username")}
                                                    aria-label={`Copy username for ${cred.service_name}`}
                                                >
                                                    <Copy className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Password Group */}
                                        <div className="space-y-1">
                                            <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider pl-1">Password</Label>
                                            <div className="flex items-center justify-between rounded-lg bg-slate-50/70 p-2.5 transition-colors group/field hover:bg-blue-50/45">
                                                <span className="text-sm font-mono text-slate-700 truncate select-all">
                                                    {isVisible ? decryptString(cred.encrypted_password) : '************'}
                                                </span>
                                                <div className="flex items-center gap-1 opacity-0 group-hover/field:opacity-100 transition-opacity">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-slate-400 hover:text-primary rounded"
                                                        onClick={() => toggleVisibility(cred.id)}
                                                        aria-label={`${isVisible ? 'Hide' : 'Show'} password for ${cred.service_name}`}
                                                    >
                                                        {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-slate-400 hover:text-primary rounded"
                                                        onClick={() => copyToClipboard(decryptString(cred.encrypted_password), "Password")}
                                                        aria-label={`Copy password for ${cred.service_name}`}
                                                    >
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <Button
                                        variant="outline"
                                        className="mt-5 w-full rounded-xl border-0 bg-slate-50 text-slate-700 hover:bg-blue-50/70"
                                        onClick={() => openEditDialog(cred)}
                                    >
                                        Edit Details
                                    </Button>
                                </CardContent>
                            </Card>
                        );
                    })}
                    {!isLoading && filteredCredentials.length === 0 && (
                        <div className="text-center col-span-full py-10 text-muted-foreground flex flex-col items-center gap-3">
                            {hasSearchQuery ? (
                                <>
                                    <Search className="w-12 h-12 opacity-20" />
                                    <p>No credentials found matching your search.</p>
                                    <Button variant="link" onClick={() => setSearchQuery('')}>Clear Search</Button>
                                </>
                            ) : (
                                <>
                                    <KeyRound className="w-12 h-12 opacity-20" />
                                    <p>No credentials saved yet.</p>
                                    <p className="text-sm">Add your first credential to keep team logins organized.</p>
                                    <Button variant="link" onClick={openAddDialog}>Add New Credential</Button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Dialogs */}
                <PasswordGenerator open={isGeneratorOpen} onOpenChange={setIsGeneratorOpen} />
                <CredentialDialog
                    open={isDialogOpen}
                    onOpenChange={setIsDialogOpen}
                    onSave={handleSave}
                    initialData={editingCredential}
                    onGenerate={() => setIsGeneratorOpen(true)}
                    projects={projects}
                />

                {/* Delete Alert */}
                <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete this credential from your vault.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={confirmDelete}>
                                Delete Credential
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </AppLayout>
    );
};

export default PasswordVault;
