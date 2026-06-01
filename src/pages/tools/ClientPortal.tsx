import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from "@/components/ui/button";
import { Plus, Search, Filter, CheckCircle2, XCircle, MessageSquare, ArrowLeft, MoreHorizontal, ChevronDown, ChevronRight, Image as ImageIcon, Folder, ThumbsUp, Globe, Heart, Send, Bookmark, Pencil, Trash2, Maximize2, Layers, CalendarDays, FileText, Hash, Megaphone, MousePointerClick, Target } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import { Label } from "@/components/ui/label";
import { cn } from '@/lib/utils';
import { Textarea } from "@/components/ui/textarea";
import { ContentItem, useProjects, useAllFolders, useAllCampaigns, useAllContentItems, usePortalClients, usePortalFeeds, usePortalReviewPosts } from '@/hooks/useDatabase';
import { GoogleAd, SocialAd, BlogPost } from '@/types';

// Types
type Client = {
    id: string;
    name: string;
    company: string;
    logo: string;
    pendingCount: number;
};

type ClientFeed = {
    id: string;
    clientId: string;
    name: string;
    postCount: number;
};

type Comment = {
    id: string;
    author: string;
    text: string;
    date: string;
    avatar?: string;
};

type ReviewPost = {
    id: string;
    platform: 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'google' | 'website' | 'pinterest' | 'tiktok';
    content: string;
    image?: string;
    status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
    date: string;
    feedId: string;
    comments: Comment[];
    // Content type for proper display
    contentType: 'social-post' | 'google-ad' | 'social-ad' | 'blog' | 'campaign';
    // Google Ads fields
    headlines?: string[];
    descriptions?: string[];
    displayUrl?: string;
    finalUrl?: string; // Added for compatibility
    path1?: string;
    path2?: string;
    // Social Ads fields  
    headline?: string;
    primaryText?: string;
    ctaText?: string;
    description?: string; // Added for social ads
    destinationUrl?: string;
    caption?: string;
    // Blog fields
    title?: string;
    excerpt?: string;
    slug?: string;
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    featuredImage?: string;
    // Campaign fields
    campaignName?: string;
    campaignType?: string;
    name?: string;
    creativeBrief?: string;
    topic?: string;
    hashtags?: string[];
    platforms?: string[];
    scheduledDate?: string;
    cta?: string;
    campaignAssets?: Array<{
        name: string;
        type?: string;
        contentType?: ReviewPost['contentType'];
    }>;
    _contentItemId?: string;
};

type TreeItem = {
    id: string;
    type: 'project' | 'folder' | 'campaign' | 'post';
    name: string;
    children?: TreeItem[];
    campaignType?: string;
    originalPost?: ContentItem;
    originalGoogleAd?: GoogleAd;
    originalSocialAd?: SocialAd;
    originalBlog?: BlogPost;
};

const getString = (value: unknown): string => typeof value === 'string' ? value : '';
const getFirstString = (value: unknown): string => Array.isArray(value) && typeof value[0] === 'string' ? value[0] : '';
const getRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const getArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const getStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
const summarizeText = (value: unknown, fallback = 'No copy added yet.', maxLength = 220): string => {
    const text = getString(value).trim();
    if (!text) return fallback;
    return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
};
const formatLabel = (value: unknown): string => {
    const text = getString(value);
    if (!text) return '';
    return text
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
};
const formatCampaignType = (value: unknown): string => {
    switch (getString(value)) {
        case 'socials':
            return 'Social Media';
        case 'google-ad':
            return 'Google Search';
        case 'meta-ad':
            return 'Paid Social';
        case 'blogs':
            return 'Blog';
        default:
            return formatLabel(value) || 'Campaign';
    }
};

const toReviewPlatform = (value: unknown): ReviewPost['platform'] => {
    const platform = getString(value);
    if (platform === 'google-ad') return 'google';
    if (platform === 'blog' || platform === 'blogs') return 'website';
    if (platform === 'meta-ad' || platform === 'social-ad') return 'facebook';
    if (platform === 'post' || platform === 'socials' || platform === 'social-post') return 'instagram';
    return ['instagram', 'facebook', 'twitter', 'linkedin', 'google', 'website', 'pinterest', 'tiktok'].includes(platform)
        ? platform as ReviewPost['platform']
        : 'instagram';
};
const toReviewStatus = (value: unknown): ReviewPost['status'] => {
    const status = getString(value);
    return ['pending', 'approved', 'rejected', 'changes_requested'].includes(status)
        ? status as ReviewPost['status']
        : 'pending';
};
const toReviewContentType = (value: unknown): ReviewPost['contentType'] => {
    switch (getString(value)) {
        case 'post':
        case 'socials':
        case 'social-post':
            return 'social-post';
        case 'google-ad':
            return 'google-ad';
        case 'meta-ad':
        case 'social-ad':
            return 'social-ad';
        case 'blog':
        case 'blogs':
            return 'blog';
        case 'campaign':
            return 'campaign';
        default:
            return 'social-post';
    }
};
const getReviewContent = (contentType: ReviewPost['contentType'], payload: Record<string, unknown>, fallback = 'Untitled'): string => {
    switch (contentType) {
        case 'google-ad':
            return getFirstString(payload.headlines) || getString(payload.headline) || getString(payload.content) || fallback;
        case 'social-ad':
            return getString(payload.primaryText) || getString(payload.headline) || getString(payload.content) || fallback;
        case 'blog':
            return getString(payload.content) || getString(payload.excerpt) || getString(payload.title) || fallback;
        case 'campaign':
            return getString(payload.campaignName) || getString(payload.name) || getString(payload.content) || fallback;
        default:
            return getString(payload.caption) || getString(payload.content) || fallback;
    }
};
const getReviewImage = (payload: Record<string, unknown>): string | undefined =>
    getString(payload.image_url) || getString(payload.image) || getString(payload.featuredImage) || undefined;
const formatReviewDate = (value: unknown): string => {
    const rawDate = getString(value);
    if (!rawDate) return '';
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) return rawDate;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const mapPortalComments = (value: unknown): Comment[] =>
    getArray(value).map((comment, index) => {
        const record = getRecord(comment);
        return {
            id: getString(record.id) || `${index}`,
            author: getString(record.author) || 'Unknown',
            text: getString(record.text),
            date: formatReviewDate(record.created_at) || 'Just now',
            avatar: getString(record.avatar) || undefined,
        };
    }).filter(comment => comment.text);

export default function ClientPortal() {
    const { data: projects = [] } = useProjects();
    const { data: folders = [] } = useAllFolders();
    const { data: campaigns = [] } = useAllCampaigns();
    const { data: contentItems = [] } = useAllContentItems();
    const { data: dbClients = [], addClient, updateClient, deleteClient } = usePortalClients();
    
    const [view, setView] = useState<'grid' | 'workspace'>('grid');
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

    const clients = dbClients.map(c => ({
        id: c.id,
        name: c.name,
        company: c.company || c.name,
        logo: c.logo || c.name.charAt(0).toUpperCase(),
        pendingCount: 0
    }));
    const selectedClient = selectedClientId
        ? clients.find(c => c.id === selectedClientId)
        : null;

    const handleClientSelect = (clientId: string) => {
        setSelectedClientId(clientId);
        setView('workspace');
    };

    const handleBackToGrid = () => {
        setSelectedClientId(null);
        setView('grid');
    };

    const handleRenameClient = (id: string, newName: string) => {
        updateClient.mutate({ id, updates: { name: newName } });
    };

    const handleDeleteClient = (id: string) => {
        deleteClient.mutate(id);
        if (selectedClientId === id) {
            handleBackToGrid();
        }
    };

    const handleAddClient = (name: string, company: string) => {
        addClient.mutate({ name, company });
    };

    // Build the tree data structure including ALL content types
    const buildProjectTree = (): TreeItem[] => {
        return projects.map(project => {
            const projectFolders = folders.filter(f => f.projectId === project.id);

            const folderNodes: TreeItem[] = projectFolders.map(folder => {
                const folderCampaigns = campaigns.filter(c => c.folderId === folder.id);

                const campaignNodes: TreeItem[] = folderCampaigns.map(campaign => {
                    // Get posts
                    const campaignPosts = contentItems.filter(p => p.campaignId === campaign.id);
                    const postNodes: TreeItem[] = campaignPosts.map(post => {
                        let name = post.name || 'Untitled';
                        if (post.type === 'social-post') name = getString(post.payload.caption).slice(0, 40) || name;
                        else if (post.type === 'google-ad') name = getFirstString(post.payload.headlines) || name;
                        else if (post.type === 'social-ad') name = getString(post.payload.primaryText) || name;
                        else if (post.type === 'blog') name = getString(post.payload.title) || name;

                        return {
                            id: post.id,
                            type: 'post' as const,
                            name: name,
                            originalPost: post
                        };
                    });

                    return {
                        id: campaign.id,
                        type: 'campaign' as const,
                        name: campaign.name,
                        campaignType: campaign.type,
                        children: postNodes
                    };
                });

                return {
                    id: folder.id,
                    type: 'folder' as const,
                    name: folder.name,
                    children: campaignNodes
                };

            });

            return {
                id: project.id,
                type: 'project',
                name: project.name,
                children: folderNodes
            };
        });
    };

    const projectTreeData = buildProjectTree();

    return (
        <AppLayout breadcrumbs={[
            { label: 'Tools', path: '#' },
            { label: 'Client Portal', path: '/tools/client-portal', onClick: handleBackToGrid },
            ...(selectedClientId ? [{ label: clients.find(c => c.id === selectedClientId)?.name || 'Client', path: '#' }] : [])
        ]}>
            {view === 'grid' || !selectedClient ? (
                <ClientGrid
                    clients={clients}
                    onSelectClient={handleClientSelect}
                    onRenameClient={handleRenameClient}
                    onDeleteClient={handleDeleteClient}
                    onAddClient={handleAddClient}
                />
            ) : (
                <ClientWorkspace
                    clientId={selectedClient.id}
                    client={selectedClient}
                    onBack={handleBackToGrid}
                    treeData={projectTreeData}
                />
            )}
        </AppLayout>
    );
}

// ----------------------------------------------------------------------
// 1. Client Grid View
// ----------------------------------------------------------------------

interface ClientCardProps {
    client: Client;
    onSelect: () => void;
    onRename: (id: string, name: string) => void;
    onDelete: (id: string) => void;
}

function ClientCard({ client, onSelect, onRename, onDelete }: ClientCardProps) {
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [newName, setNewName] = useState(client.name);

    const handleRename = () => {
        if (newName.trim()) {
            onRename(client.id, newName.trim());
        }
        setRenameDialogOpen(false);
    };

    const handleDelete = () => {
        onDelete(client.id);
        setDeleteDialogOpen(false);
    };

    return (
        <>
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <Card
                        className="group hover:shadow-lg transition-all cursor-pointer border-slate-200 overflow-hidden relative"
                        onClick={onSelect}
                    >
                        <CardHeader className="flex flex-row items-center gap-4 pb-4 bg-slate-50/50 border-b border-slate-100">
                            <Avatar className="h-14 w-14 border border-white shadow-sm">
                                <AvatarImage src={`https://avatar.vercel.sh/${client.logo}.png?text=${client.logo}`} />
                                <AvatarFallback>{client.logo}</AvatarFallback>
                            </Avatar>
                            <div>
                                <CardTitle className="text-lg group-hover:text-primary transition-colors">{client.name}</CardTitle>
                                <CardDescription>{client.company}</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-500 font-medium">Pending Reviews</span>
                                <Badge variant={client.pendingCount > 0 ? "secondary" : "outline"} className={cn(
                                    "px-3 py-1 text-xs",
                                    client.pendingCount > 0 ? "bg-orange-100 text-orange-700 hover:bg-orange-100" : "text-slate-400"
                                )}>
                                    {client.pendingCount} Posts
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                    <ContextMenuItem
                        onClick={(e) => {
                            e.stopPropagation();
                            setNewName(client.name);
                            setRenameDialogOpen(true);
                        }}
                        className="gap-2"
                    >
                        <Pencil className="w-4 h-4" />
                        Rename
                    </ContextMenuItem>
                    <ContextMenuItem
                        onClick={(e) => {
                            e.stopPropagation();
                            setDeleteDialogOpen(true);
                        }}
                        className="gap-2 text-destructive focus:text-destructive"
                    >
                        <Trash2 className="w-4 h-4" />
                        Delete
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            {/* Rename Dialog */}
            <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
                <DialogContent className="sm:max-w-[400px]" onClick={(e) => e.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle>Rename Client</DialogTitle>
                        <DialogDescription>
                            Enter a new name for this client.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="rename">Name</Label>
                            <Input
                                id="rename"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                                autoFocus
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleRename}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete "{client.name}" and all associated data. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

interface ClientGridProps {
    clients: Client[];
    onSelectClient: (id: string) => void;
    onRenameClient: (id: string, newName: string) => void;
    onDeleteClient: (id: string) => void;
    onAddClient: (name: string, company: string) => void;
}

function ClientGrid({ clients, onSelectClient, onRenameClient, onDeleteClient, onAddClient }: ClientGridProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [isNewClientOpen, setIsNewClientOpen] = useState(false);
    const [newClientName, setNewClientName] = useState('');
    const [newClientCompany, setNewClientCompany] = useState('');

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.company.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleAddClient = () => {
        if (newClientName.trim()) {
            onAddClient(newClientName.trim(), newClientCompany.trim() || newClientName.trim());
            setNewClientName('');
            setNewClientCompany('');
            setIsNewClientOpen(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto py-8 px-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Client Portal</h1>
                    <p className="text-slate-500 mt-1">Manage client reviews and approvals from a single dashboard.</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search clients..."
                            className="pl-9 bg-white"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Dialog open={isNewClientOpen} onOpenChange={setIsNewClientOpen}>
                        <DialogTrigger asChild>
                            <Button className="rounded-full gap-2">
                                <Plus className="w-4 h-4" /> New Client
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[400px]">
                            <DialogHeader>
                                <DialogTitle>Add New Client</DialogTitle>
                                <DialogDescription>
                                    Create a new client to manage their content reviews.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="client-name">Client Name</Label>
                                    <Input
                                        id="client-name"
                                        placeholder="e.g., Acme Corp"
                                        value={newClientName}
                                        onChange={(e) => setNewClientName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddClient()}
                                        autoFocus
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="company-name">Company Name</Label>
                                    <Input
                                        id="company-name"
                                        placeholder="e.g., Acme Corporation"
                                        value={newClientCompany}
                                        onChange={(e) => setNewClientCompany(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddClient()}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsNewClientOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={handleAddClient} disabled={!newClientName.trim()}>
                                    Create Client
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredClients.map(client => (
                    <ClientCard
                        key={client.id}
                        client={client}
                        onSelect={() => onSelectClient(client.id)}
                        onRename={onRenameClient}
                        onDelete={onDeleteClient}
                    />
                ))}
                {filteredClients.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                            <Plus className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">No clients yet</h3>
                        <p className="text-slate-500 mb-4">Get started by adding your first client.</p>
                        <Button onClick={() => setIsNewClientOpen(true)} className="gap-2">
                            <Plus className="w-4 h-4" /> Add Client
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ----------------------------------------------------------------------
// 2. Client Workspace (Sidebar + Feed)
// ----------------------------------------------------------------------

interface ClientWorkspaceProps {
    clientId: string;
    client: Client;
    onBack: () => void;
    treeData: TreeItem[];
}

function ClientWorkspace({ clientId, client, onBack, treeData }: ClientWorkspaceProps) {
    const { data: dbFeeds = [], addFeed } = usePortalFeeds(clientId);
    const clientFeeds = useMemo(
        () => dbFeeds.map(f => ({ id: f.id, clientId: f.client_id, name: f.name, postCount: 0 })),
        [dbFeeds]
    );
    
    const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
    useEffect(() => {
        if (clientFeeds.length === 0) {
            if (selectedFeedId) setSelectedFeedId(null);
            return;
        }

        const selectedFeedExists = selectedFeedId
            ? clientFeeds.some(feed => feed.id === selectedFeedId)
            : false;

        if (!selectedFeedExists) {
            setSelectedFeedId(clientFeeds[0].id);
        }
    }, [clientFeeds, selectedFeedId]);
    
    const [isCreateFeedOpen, setIsCreateFeedOpen] = useState(false);
    const [newFeedName, setNewFeedName] = useState('');

    const { data: dbPosts = [], addReviewPost, updateReviewStatus, addComment } = usePortalReviewPosts(selectedFeedId || '');
    const feedPosts = dbPosts.map(p => {
        const snapshot = getRecord(p.snapshot);
        const contentType = toReviewContentType(p.content_type || snapshot.contentType);
        return ({
            ...snapshot,
            id: p.id,
            platform: toReviewPlatform(snapshot.platform || contentType),
            content: getReviewContent(contentType, snapshot),
            image: getReviewImage(snapshot),
            status: toReviewStatus(p.status),
            date: formatReviewDate(p.created_at),
            feedId: p.feed_id,
            comments: mapPortalComments((p as Record<string, unknown>).portal_comments),
            contentType,
        });
    });

    const handleCreateFeedClick = () => {
        setNewFeedName('');
        setIsCreateFeedOpen(true);
    };

    const handleCreateFeedSubmit = () => {
        if (!newFeedName.trim()) return;
        addFeed.mutate(newFeedName);
        setIsCreateFeedOpen(false);
    };

    const handleImportPosts = (newPosts: ReviewPost[]) => {
        newPosts.forEach(post => {
            const { id, feedId, status, date, comments, _contentItemId, contentType, ...snapshot } = post;
            addReviewPost.mutate({
                content_item_id: _contentItemId,
                content_type: contentType,
                snapshot: {
                    ...snapshot,
                    platform: post.platform,
                    content: post.content,
                    image_url: post.image,
                }
            });
        });
    };

    return (
        <div className="flex h-[calc(100vh-120px)] gap-6">
            {/* Sidebar */}
            <div className="w-72 flex flex-col gap-4 border-r pr-6">
                <Button variant="ghost" className="self-start -ml-2 text-slate-500 hover:text-slate-900 gap-2 mb-2" onClick={onBack}>
                    <ArrowLeft className="w-4 h-4" /> Back to Clients
                </Button>

                <div className="flex items-center gap-3 px-1 mb-2">
                    <Avatar className="h-10 w-10 border border-slate-200">
                        <AvatarImage src={`https://avatar.vercel.sh/${client.logo}.png?text=${client.logo}`} />
                        <AvatarFallback>{client.logo}</AvatarFallback>
                    </Avatar>
                    <div>
                        <h2 className="font-bold text-slate-900">{client.name}</h2>
                        <p className="text-xs text-muted-foreground">Workspace</p>
                    </div>
                </div>

                <div className="flex items-center justify-between mt-4">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest pl-1">Feeds</h3>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCreateFeedClick}>
                        <Plus className="w-3.5 h-3.5" />
                    </Button>
                </div>

                <ScrollArea className="flex-1 -mr-2 pr-2">
                    <div className="space-y-1">
                        {clientFeeds.map(feed => (
                            <button
                                key={feed.id}
                                onClick={() => setSelectedFeedId(feed.id)}
                                className={cn(
                                    "w-full flex items-center justify-between text-left px-3 py-2.5 rounded-lg text-sm transition-all",
                                    selectedFeedId === feed.id
                                        ? "bg-primary/10 text-primary font-medium shadow-sm ring-1 ring-primary/20"
                                        : "text-slate-600 hover:bg-slate-50"
                                )}
                            >
                                <span className="truncate">{feed.name}</span>
                                <Badge variant="secondary" className={cn("text-[10px] h-5 px-1.5", selectedFeedId === feed.id ? "bg-white text-primary" : "bg-slate-100")}>
                                    {feed.postCount > 0 ? feed.postCount : '-'}
                                </Badge>
                            </button>
                        ))}
                        {clientFeeds.length === 0 && (
                            <p className="text-sm text-muted-foreground px-3 py-2 italic text-center">No feeds yet.</p>
                        )}
                    </div>
                </ScrollArea>

                <div className="mt-auto pt-4 border-t">
                    <p className="text-[10px] text-slate-400 text-center">
                        Client View URL: <span className="font-mono text-slate-500 select-all cursor-pointer hover:text-primary">portal.socialsuite.com/{client.id}</span>
                    </p>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {selectedFeedId ? (
                    <>
                        <div className="flex items-center justify-between pb-6 border-b border-slate-100 mb-6">
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900">{clientFeeds.find(f => f.id === selectedFeedId)?.name}</h1>
                                <p className="text-slate-500 text-sm mt-1">{feedPosts.length} posts in this feed</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button variant="outline" className="gap-2 rounded-full border-slate-200">
                                    <Filter className="w-4 h-4" /> Filter
                                </Button>
                                <PostPicker
                                    treeData={treeData}
                                    onImport={handleImportPosts}
                                    targetFeedId={selectedFeedId}
                                />
                            </div>
                        </div>

                        <ScrollArea className="flex-1 pr-6">
                            <div className="space-y-8 max-w-4xl mx-auto pb-20">
                                {feedPosts.length === 0 ? (
                                    <div className="text-center py-24 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
                                            <ImageIcon className="w-8 h-8 text-slate-300" />
                                        </div>
                                        <h3 className="text-slate-900 font-medium mb-1">No posts here yet</h3>
                                        <p className="text-slate-500 text-sm mb-6">Add posts from your projects to start the review process.</p>
                                        <PostPicker
                                            treeData={treeData}
                                            onImport={handleImportPosts}
                                            targetFeedId={selectedFeedId}
                                            buttonLabel="Add Your First Post"
                                        />
                                    </div>
                                ) : (
                                    feedPosts.map(post => (
                                        <PostCard
                                            key={post.id}
                                            post={post}
                                            onStatusChange={(postId, status) => updateReviewStatus.mutate({ id: postId, status })}
                                            onAddComment={(postId, text) => addComment.mutate({
                                                postId,
                                                comment: { author: 'You', text, is_client: false }
                                            })}
                                        />
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <Folder className="w-16 h-16 mb-4 opacity-20" />
                        <p>Select a feed to view posts</p>
                    </div>
                )}
            </div>

            <Dialog open={isCreateFeedOpen} onOpenChange={setIsCreateFeedOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Feed</DialogTitle>
                        <DialogDescription>
                            Enter a name for the new client campaign feed.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            value={newFeedName}
                            onChange={(e) => setNewFeedName(e.target.value)}
                            placeholder="e.g. October Campaign"
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateFeedSubmit()}
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateFeedOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateFeedSubmit}>Create Feed</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}

// ----------------------------------------------------------------------
// 3. Post Picker Dialog
// ----------------------------------------------------------------------

function PostPicker({ onImport, targetFeedId, buttonLabel, treeData }: { onImport: (posts: ReviewPost[]) => void, targetFeedId: string, buttonLabel?: string, treeData: TreeItem[] }) {
    const [open, setOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Flatten helper to find posts in the new tree structure
    const findPostById = (id: string, items: TreeItem[]): TreeItem | undefined => {
        for (const item of items) {
            if (item.id === id) return item;
            if (item.children) {
                const found = findPostById(id, item.children);
                if (found) return found;
            }
        }
        return undefined;
    };

    const handleImport = () => {
        const newPosts: ReviewPost[] = selectedIds.map(id => {
            const item = findPostById(id, treeData);
            if (!item) return null;

            const basePost = {
                id: Date.now().toString() + Math.random().toString(36).slice(2),
                status: 'pending' as const,
                date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                feedId: targetFeedId,
                comments: []
            };

            // Handle different content types
            
            const dbPost = item.originalPost;
            if (dbPost) {
                const payload = dbPost.payload || {};
                const contentType = toReviewContentType(dbPost.type);
                const platformValue = getString(payload.platform) || getFirstString(payload.platforms) || contentType;
                return {
                    ...payload,
                    ...basePost,
                    _contentItemId: dbPost.id,
                    name: dbPost.name,
                    platform: toReviewPlatform(platformValue),
                    content: getReviewContent(contentType, payload, dbPost.name || 'Untitled'),
                    image: getReviewImage(payload),
                    contentType,
                    ctaText: getString(payload.ctaText) || getString(payload.cta),
                };
            } else if (item.type === 'campaign') {
                const campaignAssets = (item.children || [])
                    .filter(child => child.type === 'post')
                    .map(child => ({
                        name: child.name,
                        type: child.originalPost?.type || item.campaignType,
                        contentType: toReviewContentType(child.originalPost?.type || item.campaignType),
                    }));

                return {
                    ...basePost,
                    platform: toReviewPlatform(item.campaignType),
                    content: item.name,
                    contentType: 'campaign',
                    campaignName: item.name,
                    campaignType: item.campaignType,
                    campaignAssets,
                };
            }
            return null;
        }).filter(Boolean) as ReviewPost[];

        onImport(newPosts);
        setOpen(false);
        setSelectedIds([]);
    };

    const toggleSelection = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // Recursive tree renderer
    const renderTree = (items: TreeItem[], level = 0) => {
        return items.map(item => {
            const isSelectable = item.type === 'post' || item.type === 'campaign';
            const isSelected = selectedIds.includes(item.id);

            return (
                <div key={item.id} className="select-none">
                    <div
                        className={cn(
                            "flex items-center gap-2 py-2 px-2 hover:bg-slate-50 rounded-md",
                            level > 0 && "ml-6",
                            isSelectable && "cursor-pointer"
                        )}
                        onClick={() => isSelectable && toggleSelection(item.id)}
                    >
                        {isSelectable ? (
                            <div className={cn(
                                "w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0",
                                isSelected ? "bg-primary border-primary" : "border-slate-300"
                            )}>
                                {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                            </div>
                        ) : (
                            <div className="w-4 shrink-0" />
                        )}

                        {item.type === 'folder' ? <Folder className="w-4 h-4 text-primary/70 shrink-0" /> :
                            item.type === 'project' ? <Folder className="w-4 h-4 text-slate-800 fill-slate-800 shrink-0" /> :
                                item.type === 'campaign' ? <Layers className="w-4 h-4 text-primary shrink-0" /> :
                                    <ImageIcon className="w-4 h-4 text-slate-500 shrink-0" />}

                        <span className={cn("text-sm truncate", item.type === 'project' && "font-semibold")}>{item.name}</span>
                    </div>
                    {item.children && item.children.length > 0 && renderTree(item.children, level + 1)}
                </div>
            );
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="gap-2 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground pl-4 pr-6">
                    <Plus className="w-4 h-4" /> {buttonLabel || "Add Post"}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Import Posts</DialogTitle>
                    <DialogDescription>Select posts from your projects to add to this client feed.</DialogDescription>
                </DialogHeader>

                <div className="border rounded-md mt-4 h-[300px]">
                    <ScrollArea className="h-full p-4">
                        {treeData.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                <p>No posts found in your projects.</p>
                            </div>
                        ) : (
                            renderTree(treeData)
                        )}
                    </ScrollArea>
                </div>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleImport} disabled={selectedIds.length === 0} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                        Import {selectedIds.length} Posts
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ----------------------------------------------------------------------
// 4. Feed Card & Analyzers
// ----------------------------------------------------------------------

function PostCard({
    post,
    onStatusChange,
    onAddComment,
}: {
    post: ReviewPost,
    onStatusChange: (postId: string, status: ReviewPost['status']) => void,
    onAddComment: (postId: string, text: string) => void,
}) {
    const [commentText, setCommentText] = useState('');
    const [isCommentsOpen, setIsCommentsOpen] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    const handleAddComment = () => {
        const text = commentText.trim();
        if (!text) return;
        onAddComment(post.id, text);
        setCommentText('');
    };

    const handleStatusUpdate = (status: ReviewPost['status']) => {
        onStatusChange(post.id, status);
    };

    const getBadgeLabel = () => {
        if (post.contentType === 'campaign') return `${formatCampaignType(post.campaignType)} Campaign`;
        if (post.contentType === 'google-ad') return 'Google Search';
        if (post.contentType === 'social-ad') return 'Paid Social';
        if (post.contentType === 'blog') return 'Blog Article';
        if (post.platform === 'twitter') return 'X';
        return formatLabel(post.platform) || 'Social';
    };

    return (
        <Card className="overflow-hidden border-slate-200 shadow-sm hover:shadow-md transition-shadow group bg-white">
            {/* Header */}
            <div className="flex flex-row items-center justify-between py-3 px-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3">
                    <Badge variant="outline" className="capitalize bg-white shadow-sm border-slate-200 font-medium">
                        {getBadgeLabel()}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-medium">{post.date}</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-primary"
                        onClick={() => setIsDetailsOpen(true)}
                        title="View Full Details"
                    >
                        <Maximize2 className="w-4 h-4" />
                    </Button>
                    <StatusBadge status={post.status} />
                </div>
            </div>

            <div className="flex flex-col md:flex-row">
                {/* Content Preview Area */}
                <div className="flex-1 border-r border-slate-100 p-6 bg-slate-50/30 flex justify-center">
                    <div className="w-full max-w-xl">
                        {post.contentType === 'social-post' && <SocialPostViewer post={post} />}
                        {post.contentType === 'google-ad' && <GoogleAdViewer post={post} />}
                        {post.contentType === 'social-ad' && <SocialAdViewer post={post} />}
                        {post.contentType === 'blog' && <BlogViewer post={post} />}
                        {post.contentType === 'campaign' && <CampaignViewer post={post} />}
                        {!post.contentType && (
                            <div className="text-center p-8 text-slate-400">
                                <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>Unknown Content Type</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar: Actions & Comments */}
                <div className="w-full md:w-80 flex flex-col bg-white">
                    {/* Actions */}
                    <div className="p-5 border-b border-slate-100">
                        <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4">Review Actions</h4>
                        <div className="space-y-3">
                            <Button
                                size="sm"
                                className={cn(
                                    "w-full justify-start gap-2 shadow-sm font-medium transition-all",
                                    post.status === 'approved'
                                        ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-100 ring-offset-1"
                                        : "bg-white border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                                )}
                                onClick={() => handleStatusUpdate('approved')}
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                {post.status === 'approved' ? 'Approved' : 'Approve'}
                            </Button>

                            <Button
                                size="sm"
                                className={cn(
                                    "w-full justify-start gap-2 shadow-sm font-medium transition-all",
                                    post.status === 'changes_requested'
                                        ? "bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-amber-100 ring-offset-1"
                                        : "bg-white border border-slate-200 text-slate-700 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200"
                                )}
                                onClick={() => handleStatusUpdate('changes_requested')}
                            >
                                <MessageSquare className="w-4 h-4" />
                                Request Changes
                            </Button>

                            <Button
                                size="sm"
                                className={cn(
                                    "w-full justify-start gap-2 shadow-sm font-medium transition-all",
                                    post.status === 'rejected'
                                        ? "bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-100 ring-offset-1"
                                        : "bg-white border border-slate-200 text-slate-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                                )}
                                onClick={() => handleStatusUpdate('rejected')}
                            >
                                <XCircle className="w-4 h-4" />
                                Reject
                            </Button>
                        </div>
                    </div>

                    {/* Comments */}
                    <div className="flex-1 flex flex-col min-h-[250px] p-4 bg-slate-50/50">
                        <div className="flex items-center gap-2 mb-3">
                            <MessageSquare className="w-4 h-4 text-slate-400" />
                            <h4 className="text-sm font-semibold text-slate-600">Comments</h4>
                            <Badge variant="secondary" className="h-5 px-1.5 bg-slate-200 text-slate-600 ml-auto">{post.comments.length}</Badge>
                        </div>

                        <ScrollArea className="flex-1 -mr-2 pr-2 mb-3">
                            {post.comments.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs italic py-8">
                                    <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
                                    No comments yet
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {post.comments.map(comment => (
                                        <div key={comment.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm text-sm">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="font-semibold text-slate-800 text-xs">{comment.author}</span>
                                                <span className="text-[10px] text-slate-400">{comment.date}</span>
                                            </div>
                                            <p className="text-slate-600 leading-relaxed">{comment.text}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>

                        <div className="mt-auto bg-white rounded-xl border border-slate-200 shadow-sm p-1 flex items-end focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                            <Textarea
                                placeholder="Add a comment..."
                                className="min-h-[40px] max-h-[100px] border-0 focus-visible:ring-0 resize-none text-sm bg-transparent placeholder:text-slate-400"
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleAddComment();
                                    }
                                }}
                            />
                            <Button size="icon" className="h-8 w-8 shrink-0 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground mb-0.5 mr-0.5" onClick={handleAddComment}>
                                <Send className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <PostDetailsDialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen} post={post} />
        </Card >
    );
}

function PostDetailsDialog({ open, onOpenChange, post }: { open: boolean, onOpenChange: (open: boolean) => void, post: ReviewPost }) {
    const title =
        post.campaignName ||
        post.title ||
        post.headline ||
        post.name ||
        getFirstString(post.headlines) ||
        post.topic ||
        post.content ||
        'Content preview';
    const contentLabel = post.contentType === 'campaign'
        ? `${formatCampaignType(post.campaignType)} Campaign`
        : post.contentType === 'google-ad'
            ? 'Google Search Ad'
            : post.contentType === 'social-ad'
                ? 'Paid Social Ad'
                : post.contentType === 'blog'
                    ? 'Blog Article'
                    : 'Social Media Post';

    const DetailField = ({ label, value, isCode = false }: { label: string, value?: string | number | null, isCode?: boolean }) => {
        if (value === undefined || value === null || value === '') return null;
        return (
            <div className="border-b border-slate-100 py-3 last:border-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                <p className={cn("mt-1 text-sm leading-6 text-slate-800", isCode && "break-all rounded-lg bg-slate-50 p-2 font-mono text-xs")}>
                    {value}
                </p>
            </div>
        );
    };

    const TagList = ({ label, values }: { label: string, values: string[] }) => {
        if (values.length === 0) return null;
        return (
            <div className="border-b border-slate-100 py-3 last:border-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                    {values.map(value => (
                        <span key={value} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                            {value}
                        </span>
                    ))}
                </div>
            </div>
        );
    };

    const renderGoogleAdModel = () => (
        <div className="space-y-6">
            <div className="mx-auto max-w-2xl">
                <GoogleAdViewer post={post} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Headlines</p>
                    <div className="space-y-2">
                        {post.headlines?.length ? post.headlines.map((headline, index) => (
                            <div key={`${headline}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                                {headline}
                            </div>
                        )) : <p className="text-sm italic text-slate-400">No headlines added.</p>}
                    </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Descriptions</p>
                    <div className="space-y-2">
                        {post.descriptions?.length ? post.descriptions.map((description, index) => (
                            <div key={`${description}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-800">
                                {description}
                            </div>
                        )) : <p className="text-sm italic text-slate-400">No descriptions added.</p>}
                    </div>
                </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4">
                <DetailField label="Display URL" value={post.displayUrl} isCode />
                <DetailField label="Final URL" value={post.finalUrl} isCode />
                <DetailField label="Path 1" value={post.path1} />
                <DetailField label="Path 2" value={post.path2} />
            </div>
        </div>
    );

    const renderSocialAdModel = () => (
        <div className="space-y-6">
            <div className="mx-auto max-w-2xl">
                <SocialAdViewer post={post} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4">
                <DetailField label="Platform" value={getPlatformLabel(post.platform)} />
                <DetailField label="Primary text" value={post.primaryText || post.content} />
                <DetailField label="Headline" value={post.headline || post.name} />
                <DetailField label="Description" value={post.description} />
                <DetailField label="CTA" value={formatLabel(post.ctaText || post.cta)} />
                <DetailField label="Destination URL" value={post.destinationUrl || post.finalUrl} isCode />
            </div>
        </div>
    );

    const renderSocialPostModel = () => {
        const platforms = getStringArray(post.platforms).length ? getStringArray(post.platforms) : [post.platform];
        const hashtags = getStringArray(post.hashtags);
        return (
            <div className="space-y-6">
                <div className="mx-auto max-w-2xl">
                    <SocialPostViewer post={post} />
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-4">
                    <TagList label="Platforms" values={platforms.map(getPlatformLabel)} />
                    <DetailField label="Topic" value={post.topic || post.name} />
                    <DetailField label="Scheduled date" value={post.scheduledDate} />
                    <DetailField label="Full caption" value={post.content || post.caption} />
                    <TagList label="Hashtags" values={hashtags.map(tag => tag.startsWith('#') ? tag : `#${tag}`)} />
                </div>
            </div>
        );
    };

    const renderBlogModel = () => {
        const image = post.image || post.featuredImage;
        const paragraphs = getString(post.content).split('\n').map(para => para.trim()).filter(Boolean);
        const keywords = getStringArray(post.keywords);
        return (
            <article className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {image && <img src={image} alt="Article cover" className="h-72 w-full object-cover" />}
                <div className="p-6 md:p-8">
                    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                        <span>Blog Article</span>
                        {post.slug && <span className="rounded-full bg-slate-100 px-2 py-1 font-mono text-[11px]">/{post.slug}</span>}
                    </div>
                    <h1 className="text-3xl font-bold leading-tight text-slate-950">{post.title || post.name || 'Untitled article'}</h1>
                    {post.excerpt && <p className="mt-4 text-lg leading-8 text-slate-600">{post.excerpt}</p>}

                    {(post.metaTitle || post.metaDescription || keywords.length > 0) && (
                        <div className="my-6 rounded-lg border border-slate-200 bg-slate-50/70 px-4">
                            <DetailField label="SEO title" value={post.metaTitle} />
                            <DetailField label="Meta description" value={post.metaDescription} />
                            <TagList label="Keywords" values={keywords} />
                        </div>
                    )}

                    <div className="prose prose-slate max-w-none prose-p:leading-8 prose-headings:text-slate-950 prose-a:text-primary">
                        {paragraphs.length > 0 ? paragraphs.map((para, index) => (
                            <p key={index} className="mb-5 text-slate-700">{para}</p>
                        )) : (
                            <p className="italic text-slate-400">Full article copy has not been added yet.</p>
                        )}
                    </div>
                </div>
            </article>
        );
    };

    const renderCampaignModel = () => {
        const assets = post.campaignAssets || [];
        return (
            <div className="space-y-6">
                <CampaignViewer post={post} />
                <div className="rounded-lg border border-slate-200 bg-white px-4">
                    <DetailField label="Campaign name" value={post.campaignName || post.name} />
                    <DetailField label="Campaign type" value={formatCampaignType(post.campaignType)} />
                    <DetailField label="Creative brief" value={post.creativeBrief} />
                </div>
                {assets.length > 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Included assets</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {assets.map((asset, index) => (
                                <div key={`${asset.name}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <p className="text-sm font-semibold text-slate-900">{asset.name}</p>
                                    <p className="mt-1 text-xs text-slate-500">{formatLabel(asset.type) || formatLabel(asset.contentType)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderModel = () => {
        switch (post.contentType) {
            case 'google-ad':
                return renderGoogleAdModel();
            case 'social-ad':
                return renderSocialAdModel();
            case 'blog':
                return renderBlogModel();
            case 'campaign':
                return renderCampaignModel();
            default:
                return renderSocialPostModel();
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[min(calc(100vw-2rem),1120px)] max-h-[92vh] overflow-hidden p-0">
                <DialogHeader className="border-b border-slate-200 px-6 py-5 text-left">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                            <DialogTitle className="text-2xl font-bold leading-tight text-slate-950">
                                {title}
                            </DialogTitle>
                            <DialogDescription className="mt-2">
                                Read-only client preview of the full content model.
                            </DialogDescription>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <Badge variant="outline" className="bg-white text-slate-700 border-slate-200 font-semibold">{contentLabel}</Badge>
                            <StatusBadge status={post.status} />
                        </div>
                    </div>
                </DialogHeader>

                <ScrollArea className="max-h-[calc(92vh-104px)]">
                    <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
                        <div className="bg-slate-50/60 p-6">
                            {renderModel()}
                        </div>
                        <aside className="border-t border-slate-200 bg-white p-5 lg:border-l lg:border-t-0">
                            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Review details</p>
                            <div className="rounded-lg border border-slate-200 px-4">
                                <DetailField label="Content type" value={contentLabel} />
                                <DetailField label="Platform" value={post.contentType === 'campaign' ? formatCampaignType(post.campaignType) : getPlatformLabel(post.platform)} />
                                <DetailField label="Status" value={formatLabel(post.status)} />
                                <DetailField label="Date added" value={post.date} />
                                <DetailField label="Comments" value={post.comments.length} />
                            </div>
                        </aside>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}

function LegacyPostDetailsDialog({ open, onOpenChange, post }: { open: boolean, onOpenChange: (open: boolean) => void, post: ReviewPost }) {
    // Helper to render label-value pair
    const DetailRow = ({ label, value, isCode = false }: { label: string, value: string | undefined | null | number, isCode?: boolean }) => {
        if (!value) return null;
        return (
            <div className="grid grid-cols-4 gap-4 py-3 border-b border-slate-100 last:border-0">
                <div className="font-medium text-slate-500 text-sm">{label}</div>
                <div className={cn("col-span-3 text-sm text-slate-900", isCode && "font-mono bg-slate-50 p-2 rounded-md text-xs whitespace-pre-wrap break-all")}>
                    {value}
                </div>
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        Post Details
                        <Badge variant="secondary">{post.contentType}</Badge>
                    </DialogTitle>
                    <DialogDescription>
                        Full content and metadata for this post.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-8 py-4">
                    {/* Common Fields */}
                    <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">General</h4>
                        <div className="border rounded-lg px-4">
                            {/* ID removed per user request */}
                            <DetailRow label="Platform" value={post.platform} />
                            <DetailRow label="Status" value={post.status} />
                            <DetailRow label="Date" value={post.date} />
                        </div>
                    </div>

                    {/* Google Ad Specifics */}
                    {post.contentType === 'google-ad' && (
                        <div>
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Google Ad Content</h4>
                            <div className="border rounded-lg px-4 bg-slate-50/50">
                                <div className="grid grid-cols-4 gap-4 py-3 border-b border-slate-100">
                                    <div className="font-medium text-slate-500 text-sm">Headlines</div>
                                    <div className="col-span-3 space-y-2">
                                        {post.headlines && post.headlines.length > 0 ? (
                                            post.headlines.map((h, i) => (
                                                <div key={i} className="text-sm text-slate-900 bg-white border border-slate-200 p-2 rounded-md shadow-sm">
                                                    {h}
                                                </div>
                                            ))
                                        ) : (
                                            <span className="text-sm text-slate-400 italic">No headlines</span>
                                        )}
                                    </div>
                                </div>
                                <div className="grid grid-cols-4 gap-4 py-3 border-b border-slate-100">
                                    <div className="font-medium text-slate-500 text-sm">Descriptions</div>
                                    <div className="col-span-3 space-y-2">
                                        {post.descriptions && post.descriptions.length > 0 ? (
                                            post.descriptions.map((d, i) => (
                                                <div key={i} className="text-sm text-slate-900 bg-white border border-slate-200 p-2 rounded-md shadow-sm">
                                                    {d}
                                                </div>
                                            ))
                                        ) : (
                                            <span className="text-sm text-slate-400 italic">No descriptions</span>
                                        )}
                                    </div>
                                </div>
                                <DetailRow label="Display URL" value={post.displayUrl} />
                                <DetailRow label="Final URL" value={post.finalUrl} />
                            </div>
                        </div>
                    )}

                    {/* Social Ad Specifics */}
                    {post.contentType === 'social-ad' && (
                        <div>
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Social Ad Content</h4>
                            <div className="border rounded-lg px-4">
                                <DetailRow label="Headline" value={post.headline} />
                                <DetailRow label="Primary Text" value={post.primaryText} />
                                <DetailRow label="Description" value={post.description} />
                                <DetailRow label="CTA" value={post.ctaText} />
                                <DetailRow label="Destination URL" value={post.destinationUrl} />
                            </div>
                        </div>
                    )}

                    {/* Blog Specifics */}
                    {post.contentType === 'blog' && (
                        <div className="flex flex-col gap-4">
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Blog Metadata</h4>
                                <div className="border rounded-lg px-4">
                                    <DetailRow label="Title" value={post.title} />
                                    <DetailRow label="Slug" value={(post.title || '').toLowerCase().replace(/ /g, '-')} isCode />
                                    <DetailRow label="Excerpt" value={post.excerpt} />
                                </div>
                            </div>

                            {/* Full Blog Content Display */}
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Full Article Content</h4>
                                <div className="border rounded-xl p-8 bg-white shadow-sm">
                                    <h1 className="text-2xl font-bold text-slate-900 mb-6">{post.title}</h1>
                                    <div className="prose prose-slate max-w-none prose-p:leading-relaxed prose-headings:font-bold prose-a:text-primary">
                                        {post.content ? (
                                            post.content.split('\n').map((para, i) => (
                                                <p key={i} className="mb-4 text-slate-700">{para}</p>
                                            ))
                                        ) : (
                                            <p className="text-slate-400 italic">No content available.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Social Post Specifics */}
                    {post.contentType === 'social-post' && (
                        <div>
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Post Content</h4>
                            <div className="border rounded-lg px-4">
                                <DetailRow label="Caption" value={post.content} />
                                {/* Media URL removed per user request */}
                            </div>
                        </div>
                    )}

                    {/* Campaign Specifics */}
                    {post.contentType === 'campaign' && (
                        <div>
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Campaign Details</h4>
                            <div className="border rounded-lg px-4">
                                <DetailRow label="Campaign Name" value={post.campaignName} />
                                <DetailRow label="Campaign Type" value={post.campaignType} />
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function StatusBadge({ status }: { status: ReviewPost['status'] }) {
    switch (status) {
        case 'approved':
            return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 shadow-none font-medium">Approved</Badge>;
        case 'rejected':
            return <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 border-rose-200 shadow-none font-medium">Rejected</Badge>;
        case 'changes_requested':
            return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 shadow-none font-medium">Changes Requested</Badge>;
        default:
            return <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-slate-200 font-medium">Pending Review</Badge>;
    }
}

// --- Viewers ---

const getPlatformLabel = (platform: string) => {
    switch (platform) {
        case 'linkedin':
            return 'LinkedIn';
        case 'twitter':
            return 'X';
        case 'instagram':
            return 'Instagram';
        case 'facebook':
            return 'Facebook';
        default:
            return formatLabel(platform) || 'Social';
    }
};

const getPlatformTone = (platform: string) => {
    switch (platform) {
        case 'linkedin':
            return 'bg-[#0A66C2] text-white';
        case 'twitter':
            return 'bg-slate-900 text-white';
        case 'instagram':
            return 'bg-rose-500 text-white';
        case 'facebook':
            return 'bg-[#1877F2] text-white';
        default:
            return 'bg-primary text-primary-foreground';
    }
};

const getCampaignReviewFocus = (campaignType: string | undefined) => {
    switch (campaignType) {
        case 'socials':
            return [
                { label: 'Creative Concept', value: 'Post ideas, visual direction, and captions' },
                { label: 'Channel Mix', value: 'Instagram, LinkedIn, Facebook, and X readiness' },
                { label: 'Publishing Plan', value: 'Scheduled copy and platform fit' },
            ];
        case 'meta-ad':
            return [
                { label: 'Paid Creative', value: 'Primary text, headline, visual, and offer' },
                { label: 'CTA Path', value: 'Call to action and destination URL alignment' },
                { label: 'Placement Fit', value: 'Facebook, Instagram, LinkedIn, and X variants' },
            ];
        case 'google-ad':
            return [
                { label: 'Search Intent', value: 'Headline set and keyword promise' },
                { label: 'Landing Page', value: 'Final URL and display path clarity' },
                { label: 'Extensions', value: 'Descriptions, sitelinks, and proof points' },
            ];
        case 'blogs':
            return [
                { label: 'Editorial Angle', value: 'Article topic, title, and reader promise' },
                { label: 'SEO Package', value: 'Slug, meta title, description, and keywords' },
                { label: 'Publish Readiness', value: 'Featured image and article body review' },
            ];
        default:
            return [
                { label: 'Content Scope', value: 'Assets and copy grouped for approval' },
                { label: 'Review Notes', value: 'Strategy, fit, and completion status' },
                { label: 'Next Step', value: 'Import individual assets for detailed review' },
            ];
    }
};

function SocialPostViewer({ post }: { post: ReviewPost }) {
    const platforms = post.platforms?.length ? post.platforms : [post.platform];
    const caption = summarizeText(post.content || post.caption, 'Caption copy has not been added yet.', 360);
    const hashtags = getStringArray(post.hashtags).slice(0, 5);
    const title = post.name || post.topic || 'Social post preview';

    return (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden max-w-[520px] mx-auto">
            <div className="p-4 border-b border-slate-100">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {platforms.map(platform => (
                                <span key={platform} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", getPlatformTone(platform))}>
                                    {getPlatformLabel(platform)}
                                </span>
                            ))}
                        </div>
                        <h3 className="text-lg font-bold text-slate-950 leading-tight">{title}</h3>
                        {post.scheduledDate && (
                            <p className="mt-1 text-xs text-slate-500 flex items-center gap-1.5">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {formatReviewDate(post.scheduledDate)}
                            </p>
                        )}
                    </div>
                    <MoreHorizontal className="h-5 w-5 shrink-0 text-slate-400" />
                </div>
            </div>

            <div className="bg-slate-50">
                {post.image ? (
                    <img src={post.image} alt="Post content" className="h-72 w-full object-cover" />
                ) : (
                    <div className="min-h-56 p-8 flex flex-col items-center justify-center text-center">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <MessageSquare className="h-7 w-7" />
                        </div>
                        <p className="max-w-md text-sm leading-6 text-slate-600">{caption}</p>
                    </div>
                )}
            </div>

            <div className="p-4">
                {post.image && (
                    <p className="mb-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{caption}</p>
                )}
                {hashtags.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-2">
                        {hashtags.map(tag => (
                            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                                <Hash className="h-3 w-3" />
                                {tag.replace(/^#/, '')}
                            </span>
                        ))}
                    </div>
                )}
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-slate-500">
                    <div className="flex items-center gap-4">
                        <Heart className="h-5 w-5" />
                        <MessageSquare className="h-5 w-5" />
                        <Send className="h-5 w-5" />
                    </div>
                    <Bookmark className="h-5 w-5" />
                </div>
            </div>
        </div>
    );
}

function GoogleAdViewer({ post }: { post: ReviewPost }) {
    return (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 w-full hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 p-1">
                    <div className="w-full h-full rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">G</div>
                </div>
                <div className="flex flex-col">
                    <span className="text-sm text-slate-900 font-medium leading-none">Your Company Name</span>
                    <span className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">{post.displayUrl || 'www.example.com'}</span>
                </div>
                <div className="ml-auto">
                    <span className="text-[10px] font-bold text-slate-900 px-1">Sponsored</span>
                </div>
            </div>

            <div className="space-y-1">
                <h3 className="text-xl text-[#1a0dab] font-normal hover:underline cursor-pointer leading-snug">
                    {post.headlines?.slice(0, 2).join(' | ') || post.content || 'Ad Headline Preview'}
                </h3>
                {post.descriptions?.map((desc, i) => (
                    <p key={i} className="text-sm text-[#4d5156] leading-relaxed">{desc}</p>
                ))}
            </div>

            <div className="flex gap-4 mt-3 pt-3 border-t border-slate-50">
                {['Site Link 1', 'Site Link 2', 'Contact Us', 'Pricing'].map((link, i) => (
                    <span key={i} className="text-sm text-[#1a0dab] hover:underline cursor-pointer hidden sm:inline-block">{link}</span>
                ))}
            </div>
        </div>
    );
}

function SocialAdViewer({ post }: { post: ReviewPost }) {
    const platform = post.platform || 'facebook';
    const platformLabel = getPlatformLabel(platform);
    const destination = post.destinationUrl || post.finalUrl || 'company-website.com';
    const domain = destination.replace(/^https?:\/\//, '').split('/')[0] || 'company-website.com';
    const primaryText = summarizeText(post.primaryText || post.content, 'Paid social copy has not been added yet.', 280);
    const headline = post.headline || post.name || 'Paid social headline';
    const cta = formatLabel(post.ctaText || post.cta) || 'Learn More';

    return (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm max-w-[560px] mx-auto overflow-hidden">
            <div className="flex items-start justify-between p-4">
                <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm", getPlatformTone(platform))}>
                        {platformLabel.slice(0, 2)}
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-900 leading-tight">{post.name || headline}</p>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            {platformLabel} ad <span className="w-0.5 h-0.5 rounded-full bg-slate-400" /> Sponsored <Globe className="w-3 h-3 text-slate-400" />
                        </p>
                    </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                    <MoreHorizontal className="w-4 h-4" />
                </Button>
            </div>

            <div className="px-4 pb-4">
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{primaryText}</p>
            </div>

            <div className="bg-slate-100 relative">
                {post.image ? (
                    <img src={post.image} alt="Ad Content" className="w-full h-72 object-cover" />
                ) : (
                    <div className="h-64 flex flex-col items-center justify-center bg-slate-50 p-8 text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Megaphone className="h-8 w-8" />
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{headline}</p>
                        {post.description && <p className="mt-1 max-w-sm text-xs text-slate-500">{post.description}</p>}
                    </div>
                )}
            </div>

            <div className="bg-slate-50 p-3 flex items-center justify-between border-t border-slate-200/60">
                <div className="overflow-hidden mr-4">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wide truncate mb-0.5">{domain}</p>
                    <h4 className="text-base font-bold text-slate-900 truncate leading-tight">{headline}</h4>
                    {post.description && <p className="text-xs text-slate-500 truncate mt-0.5 line-clamp-1">{post.description}</p>}
                </div>
                <Button className="font-semibold px-5 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full">
                    {cta}
                </Button>
            </div>

            <div className="px-3.5 py-2.5 border-t border-slate-100 flex items-center justify-between text-slate-500 text-xs font-medium">
                <span className="flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5" /> 245</span>
                <span className="flex items-center gap-3">
                    <span>42 Comments</span>
                    <span>12 Shares</span>
                </span>
            </div>
        </div>
    );
}

function BlogViewer({ post }: { post: ReviewPost }) {
    const [expanded, setExpanded] = useState(false);
    const image = post.image || post.featuredImage;
    const title = post.title || post.name || 'Untitled article';
    const articleBody = getString(post.content);
    const excerpt = summarizeText(post.excerpt || post.metaDescription || articleBody, 'Article summary has not been added yet.', 280);
    const keywords = getStringArray(post.keywords).slice(0, 4);
    const wordCount = articleBody.split(/\s+/).filter(Boolean).length;
    const readMinutes = Math.max(2, Math.ceil((wordCount || 420) / 220));
    const paragraphs = articleBody.split('\n').map(para => para.trim()).filter(Boolean);

    return (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm w-full overflow-hidden hover:shadow-md transition-all group/blog">
            {image ? (
                <div className="h-48 sm:h-64 overflow-hidden relative">
                    <img src={image} alt="Article cover" className="w-full h-full object-cover group-hover/blog:scale-105 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60" />
                    <Badge className="absolute bottom-4 left-4 bg-white/90 text-slate-900 hover:bg-white border-0 backdrop-blur-sm">Article</Badge>
                </div>
            ) : (
                <div className="h-44 bg-primary/5 border-b border-primary/10 flex flex-col items-center justify-center text-center px-8">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <FileText className="h-7 w-7" />
                    </div>
                    <p className="text-xs font-bold uppercase tracking-widest text-primary">Editorial Preview</p>
                </div>
            )}

            <div className="p-6 md:p-8">
                <div className="flex flex-wrap items-center gap-2 mb-3 text-xs font-medium text-slate-400 uppercase tracking-widest">
                    <span>Blog Post</span>
                    <span>&bull;</span>
                    <span>{readMinutes} min read</span>
                    {post.slug && (
                        <>
                            <span>&bull;</span>
                            <span className="normal-case tracking-normal text-slate-500">/{post.slug}</span>
                        </>
                    )}
                </div>

                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4 leading-tight group-hover/blog:text-primary transition-colors">
                    {title}
                </h2>

                {(post.metaTitle || post.metaDescription) && (
                    <div className="mb-5 grid gap-3 sm:grid-cols-2">
                        {post.metaTitle && (
                            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">SEO title</p>
                                <p className="text-sm font-semibold text-slate-800 line-clamp-2">{post.metaTitle}</p>
                            </div>
                        )}
                        {post.metaDescription && (
                            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Meta description</p>
                                <p className="text-sm text-slate-600 line-clamp-2">{post.metaDescription}</p>
                            </div>
                        )}
                    </div>
                )}

                {keywords.length > 0 && (
                    <div className="mb-5 flex flex-wrap gap-2">
                        {keywords.map(keyword => (
                            <span key={keyword} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                                <Hash className="h-3 w-3" />
                                {keyword}
                            </span>
                        ))}
                    </div>
                )}

                <div className={cn("relative", !expanded && "max-h-[140px] overflow-hidden")}>
                    <div className="prose prose-slate prose-sm max-w-none text-slate-600 leading-relaxed">
                        <p>{excerpt}</p>
                        {expanded && (
                            <div className="mt-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                {paragraphs.length > 0 ? paragraphs.map((para, i) => (
                                    <p key={i} className="mb-4">{para}</p>
                                )) : (
                                    <p className="text-slate-500">Full article copy has not been added yet.</p>
                                )}
                            </div>
                        )}
                    </div>
                    {!expanded && (
                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent" />
                    )}
                </div>

                <Button
                    variant="link"
                    className="px-0 mt-2 text-primary hover:text-primary/90 font-semibold h-auto py-2"
                    onClick={() => setExpanded(!expanded)}
                >
                    {expanded ? 'Read Less' : 'Read Full Article'} <ArrowLeft className={cn("w-4 h-4 ml-1 transition-transform duration-300", expanded ? "-rotate-90" : "rotate-180")} />
                </Button>
            </div>
        </div>
    );
}

function CampaignViewer({ post }: { post: ReviewPost }) {
    const campaignType = post.campaignType || 'campaign';
    const campaignLabel = formatCampaignType(campaignType);
    const title = post.campaignName || post.name || post.content || 'Untitled campaign';
    const focusItems = getCampaignReviewFocus(campaignType);
    const brief = getString(post.creativeBrief).trim()
        ? summarizeText(post.creativeBrief, '', 320)
        : `Review the ${campaignLabel.toLowerCase()} strategy, asset mix, and campaign direction before approving.`;
    const campaignDate = post.scheduledDate || post.date;

    let CampaignIcon = Layers;
    let accentClass = 'bg-primary/10 text-primary border-primary/15';
    let campaignAssets = [
        { icon: Layers, label: 'Asset set', value: 'Grouped content ready for review' },
        { icon: Target, label: 'Audience fit', value: 'Campaign direction and positioning' },
        { icon: CheckCircle2, label: 'Approval scope', value: 'Approve strategy or import individual assets' },
    ];

    if (campaignType === 'socials') {
        CampaignIcon = MessageSquare;
        campaignAssets = [
            { icon: MessageSquare, label: 'Captions', value: 'Post copy, hooks, and hashtags' },
            { icon: CalendarDays, label: 'Platform mix', value: 'Instagram, LinkedIn, Facebook, and X' },
            { icon: ImageIcon, label: 'Creative direction', value: 'Visual ideas and publishing flow' },
        ];
    } else if (campaignType === 'meta-ad') {
        CampaignIcon = Megaphone;
        campaignAssets = [
            { icon: Megaphone, label: 'Ad copy', value: 'Primary text, headlines, and offer' },
            { icon: MousePointerClick, label: 'CTA path', value: 'Action button and destination URL' },
            { icon: ImageIcon, label: 'Creative', value: 'Paid social visual direction' },
        ];
    } else if (campaignType === 'google-ad') {
        CampaignIcon = Search;
        campaignAssets = [
            { icon: Search, label: 'Headlines', value: 'Search ad headline variants' },
            { icon: FileText, label: 'Descriptions', value: 'Benefit-led support copy' },
            { icon: Target, label: 'Intent', value: 'Query promise and landing page fit' },
        ];
    } else if (campaignType === 'blogs') {
        CampaignIcon = FileText;
        campaignAssets = [
            { icon: FileText, label: 'Article drafts', value: 'Titles, summaries, and body copy' },
            { icon: Search, label: 'SEO package', value: 'Slug, metadata, and keywords' },
            { icon: ImageIcon, label: 'Featured image', value: 'Cover image and publishing readiness' },
        ];
    } else {
        accentClass = 'bg-slate-100 text-slate-700 border-slate-200';
    }

    return (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden w-full max-w-[620px] mx-auto">
            <div className="p-6 border-b border-slate-100 bg-gradient-to-b from-primary/5 to-white">
                <div className="flex items-start gap-4">
                    <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border", accentClass)}>
                        <CampaignIcon className="h-7 w-7" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="bg-white text-slate-700 border-slate-200 font-semibold">
                                {campaignLabel} Campaign
                            </Badge>
                            {campaignDate && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                                    <CalendarDays className="h-3.5 w-3.5" />
                                    {campaignDate}
                                </span>
                            )}
                        </div>
                        <h3 className="text-2xl font-bold text-slate-950 leading-tight">{title}</h3>
                        <p className="mt-3 text-sm leading-6 text-slate-600">{brief}</p>
                    </div>
                </div>
            </div>

            <div className="p-6 space-y-6">
                <div>
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Review focus</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                        {focusItems.map(item => (
                            <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                                <p className="text-xs font-bold text-slate-900">{item.label}</p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">{item.value}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Campaign assets</p>
                    <div className="grid gap-3">
                        {campaignAssets.map(asset => {
                            const AssetIcon = asset.icon;
                            return (
                                <div key={asset.label} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                        <AssetIcon className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">{asset.label}</p>
                                        <p className="text-xs leading-5 text-slate-500">{asset.value}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-lg border border-primary/15 bg-primary/5 p-4">
                    <p className="text-sm font-semibold text-slate-900">Review this as a campaign-level approval.</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                        Add individual assets to this feed when the client needs to approve exact copy, visuals, or destination details one by one.
                    </p>
                </div>
            </div>
        </div>
    );
}

function LegacyBlogViewer({ post }: { post: ReviewPost }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm w-full hover:shadow-md transition-all group/blog">
            <div className="relative">
                {post.image && (
                    <div className="h-48 sm:h-64 overflow-hidden rounded-t-xl relative">
                        <img src={post.image} alt="Cover" className="w-full h-full object-cover group-hover/blog:scale-105 transition-transform duration-700" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60" />
                        <Badge className="absolute bottom-4 left-4 bg-white/90 text-slate-900 hover:bg-white border-0 backdrop-blur-sm">Article</Badge>
                    </div>
                )}
            </div>

            <div className="p-6 md:p-8">
                <div className="flex items-center gap-2 mb-3 text-xs font-medium text-slate-400 uppercase tracking-widest">
                    <span>Blog Post</span>
                    <span>•</span>
                    <span>5 min read</span>
                </div>

                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4 leading-tight group-hover/blog:text-primary transition-colors">
                    {post.title || 'Untitled Article'}
                </h2>

                <div className={cn("relative", !expanded && "max-h-[120px] overflow-hidden mask-linear-fade")}>
                    <div className="prose prose-slate prose-sm max-w-none text-slate-600 leading-relaxed">
                        <p>{post.excerpt}</p>
                        {expanded && (
                            <div className="mt-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                {(post.content || '').split('\n').map((para, i) => (
                                    <p key={i} className="mb-4">{para}</p>
                                ))}
                            </div>
                        )}
                    </div>
                    {!expanded && (
                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent" />
                    )}
                </div>

                <Button
                    variant="link"
                    className="px-0 mt-2 text-primary hover:text-primary/90 font-semibold h-auto py-2"
                    onClick={() => setExpanded(!expanded)}
                >
                    {expanded ? 'Read Less' : 'Read Full Article'} <ArrowLeft className={cn("w-4 h-4 ml-1 transition-transform duration-300", expanded ? "-rotate-90" : "rotate-180")} />
                </Button>
            </div>
        </div>
    );
}

function LegacyCampaignViewer({ post }: { post: ReviewPost }) {
    return (
        <div className="flex flex-col items-center justify-center h-full p-12 text-center bg-white border border-slate-200 rounded-2xl border-dashed">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 border border-slate-100 flex items-center justify-center mb-6 shadow-notebook">
                <Layers className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">{post.campaignName}</h3>
            <Badge variant="outline" className="mb-6 capitalize px-4 py-1.5 text-sm bg-slate-50">{post.campaignType} Campaign</Badge>
            <p className="text-slate-500 max-w-sm mx-auto mb-8 leading-relaxed">
                This is a campaign container. Select specific posts within this campaign tree to view their individual content, or approve the entire campaign strategy here.
            </p>
            <Button variant="outline">View All Assets</Button>
        </div>
    );
}


