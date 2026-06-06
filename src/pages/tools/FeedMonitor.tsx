
import React, { useState, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, FolderPlus, MoreHorizontal, Link, Trash2, Edit2, Share2, Facebook, Instagram, Twitter, Linkedin, RotateCcw, Loader2, PlusCircle } from 'lucide-react';
import { TikTokEmbed, YouTubeEmbed, TwitterEmbed, InstagramEmbed, LinkedInEmbed, FacebookEmbed } from 'react-social-media-embed';
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
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
import { useFeedFolders, useFeedPosts } from '@/hooks/useDatabase';
import { Label } from "@/components/ui/label"; // Ensure Label is imported or use standard label
import { useToast } from "@/components/ui/use-toast";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type SocialScriptWindow = Window & {
    twttr?: { widgets?: { load: (element?: Element | null) => void } };
    instgrm?: { Embeds?: { process: () => void } };
};

const socialWindow = () => window as SocialScriptWindow;

// --- Hooks ---

const useSocialScripts = () => {
    useEffect(() => {
        // Twitter
        if (!socialWindow().twttr) {
            const script = document.createElement('script');
            script.src = 'https://platform.twitter.com/widgets.js';
            script.async = true;
            document.head.appendChild(script);
        }

        // Instagram
        if (!socialWindow().instgrm) {
            const script = document.createElement('script');
            script.src = 'https://www.instagram.com/embed.js';
            script.async = true;
            document.body.appendChild(script);
        }
    }, []);

    const refreshEmbeds = () => {
        if (socialWindow().twttr?.widgets) {
            socialWindow().twttr.widgets.load();
        }
        if (socialWindow().instgrm?.Embeds) {
            socialWindow().instgrm.Embeds.process();
        }
    };

    return { refreshEmbeds };
};

// Fetch Open Graph metadata using multiple CORS proxy fallbacks
// Special handling for Instagram and X/Twitter
const fetchOGMetadata = async (url: string): Promise<{
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
}> => {
    // Special handling for Instagram - use /media/?size=l endpoint for direct image
    if (url.includes('instagram.com/p/') || url.includes('instagram.com/reel/')) {
        console.log('Instagram URL detected, using /media/?size=l workaround');
        // Extract the post ID and construct direct media URL
        const match = url.match(/instagram\.com\/(p|reel)\/([^/?]+)/);
        if (match) {
            const postType = match[1];
            const postId = match[2];
            const directImageUrl = `https://www.instagram.com/${postType}/${postId}/media/?size=l`;
            console.log('Instagram direct image URL:', directImageUrl);
            return {
                title: `Instagram ${postType === 'reel' ? 'Reel' : 'Post'}`,
                description: `View this ${postType === 'reel' ? 'reel' : 'post'} on Instagram`,
                image: directImageUrl,
                siteName: 'Instagram'
            };
        }
    }

    // Special handling for X/Twitter - use fxtwitter.com bridge for better OG data
    if (url.includes('twitter.com/') || url.includes('x.com/')) {
        console.log('X/Twitter URL detected, using FxTwitter bridge');
        // Convert to fxtwitter URL for OG scraping
        let fxUrl = url.replace('twitter.com/', 'fxtwitter.com/').replace('x.com/', 'fxtwitter.com/');
        // Remove any query params
        fxUrl = fxUrl.split('?')[0];

        // Also get the direct media URL
        const match = url.match(/(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/);
        let directMediaUrl: string | undefined;
        if (match) {
            directMediaUrl = `https://d.fxtwitter.com/${match[1]}/status/${match[2]}`;
            console.log('X/Twitter direct media URL:', directMediaUrl);
        }

        // Try to fetch OG from fxtwitter
        try {
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(fxUrl)}`;
            console.log('Fetching FxTwitter OG:', proxyUrl);
            const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
            if (response.ok) {
                const data = await response.json();
                if (data.contents) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(data.contents, 'text/html');
                    const getMeta = (prop: string) => doc.querySelector(`meta[property="${prop}"]`)?.getAttribute('content');

                    const result = {
                        title: getMeta('og:title') || 'X Post',
                        description: getMeta('og:description'),
                        image: getMeta('og:image') || directMediaUrl,
                        siteName: 'X (Twitter)'
                    };
                    console.log('FxTwitter OG data:', result);
                    if (result.image || result.title) return result;
                }
            }
        } catch (e) {
            console.warn('FxTwitter fetch failed:', e);
        }

        // Fallback to direct media URL if OG fetch failed
        if (directMediaUrl) {
            return {
                title: 'X Post',
                description: 'View this post on X',
                image: directMediaUrl,
                siteName: 'X (Twitter)'
            };
        }
    }

    // Default: Use CORS proxies for other URLs (Facebook, LinkedIn, etc.)
    const corsProxies = [
        (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
        (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    ];

    const parseOGFromHTML = (html: string) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const getMeta = (property: string): string | undefined => {
            const meta = doc.querySelector(`meta[property="${property}"]`) ||
                doc.querySelector(`meta[name="${property}"]`);
            return meta?.getAttribute('content') || undefined;
        };

        const result = {
            title: getMeta('og:title') || getMeta('twitter:title') || doc.querySelector('title')?.textContent || undefined,
            description: getMeta('og:description') || getMeta('twitter:description') || getMeta('description'),
            image: getMeta('og:image') || getMeta('twitter:image') || getMeta('twitter:image:src'),
            siteName: getMeta('og:site_name')
        };

        console.log('Parsed OG data:', result);
        return result;
    };

    for (let i = 0; i < corsProxies.length; i++) {
        try {
            const proxyUrl = corsProxies[i](url);
            console.log(`Trying CORS proxy ${i + 1}:`, proxyUrl);

            const response = await fetch(proxyUrl, {
                signal: AbortSignal.timeout(10000) // 10 second timeout
            });

            if (!response.ok) {
                console.warn(`Proxy ${i + 1} returned status ${response.status}`);
                continue;
            }

            let html: string;
            const contentType = response.headers.get('content-type') || '';

            if (contentType.includes('application/json')) {
                // allorigins.win returns JSON with contents field
                const data = await response.json();
                html = data.contents || data.body || '';
            } else {
                // corsproxy.io and codetabs return raw HTML
                html = await response.text();
            }

            if (!html || html.length < 100) {
                console.warn(`Proxy ${i + 1} returned empty or too short response`);
                continue;
            }

            const ogData = parseOGFromHTML(html);

            // Check if we got any useful data
            if (ogData.title || ogData.image || ogData.description) {
                console.log('Successfully fetched OG data from proxy', i + 1);
                return ogData;
            }

            console.warn(`Proxy ${i + 1} returned no OG data`);
        } catch (error) {
            console.error(`Proxy ${i + 1} failed:`, error);
        }
    }

    console.error('All CORS proxies failed for URL:', url);
    return {};
};

// --- Mock Data ---
type FeedFolder = {
    id: string;
    name: string;
    description: string;
    postCount: number;
    color: string;
};

type SavedPost = {
    id: string;
    platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin';
    user: string;
    userHandle?: string;
    userAvatar?: string;
    content: string;
    image?: string;
    url: string;
    likes: number;
    comments: number;
    shares: number;
    date: string;
    folderId?: string;
    // OG Metadata fields
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    ogSiteName?: string;
};

const initialFolders: FeedFolder[] = [];

const PASTEL_COLORS = [
    'bg-orange-50 border-orange-100 text-orange-900',
    'bg-blue-50 border-blue-100 text-blue-900',
    'bg-amber-50 border-amber-100 text-amber-900',
    'bg-sky-50 border-sky-100 text-sky-900',
    'bg-purple-50 border-purple-100 text-purple-900',
    'bg-rose-50 border-rose-100 text-rose-900',
    'bg-teal-50 border-teal-100 text-teal-900',
    'bg-indigo-50 border-indigo-100 text-indigo-900',
];

const formatDate = (date: Date) => {
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'short' });
    const year = date.getFullYear();

    const suffix = (day: number) => {
        if (day > 3 && day < 21) return 'th';
        switch (day % 10) {
            case 1: return "st";
            case 2: return "nd";
            case 3: return "rd";
            default: return "th";
        }
    };

    return `${day}${suffix(day)} ${month} ${year}`;
};

const initialPosts: SavedPost[] = [];

type FeedDeleteTarget = {
    type: 'folder' | 'post';
    id: string;
    name: string;
};

// --- Sub-components ---

const FeedFolderCard = ({ folder, onDelete, onRename, onClick, isSelected }: {
    folder: FeedFolder,
    onDelete: (id: string) => void,
    onRename: (id: string) => void,
    onClick: () => void,
    isSelected?: boolean
}) => (
    <div
        onClick={onClick}
        className={cn(
            "group relative flex h-32 min-w-[280px] cursor-pointer flex-col justify-between rounded-xl p-4 shadow-[0_8px_24px_-22px_rgba(15,23,42,0.18)] transition-colors duration-150 hover:shadow-[0_8px_24px_-22px_rgba(15,23,42,0.18)]",
            folder.color,
            isSelected ? "shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08),0_8px_24px_-22px_rgba(15,23,42,0.18)]" : ""
        )}
    >
        <div className="flex justify-between items-start">
            <h3 className="font-semibold text-lg truncate w-[90%]">{folder.name}</h3>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <MoreHorizontal className="w-4 h-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem className="gap-2" onClick={(e) => { e.stopPropagation(); onRename(folder.id); }}><Edit2 className="w-4 h-4" /> Rename</DropdownMenuItem>

                    <DropdownMenuItem className="gap-2 text-red-600" onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}><Trash2 className="w-4 h-4" /> Delete</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
        <div>
            <div className="text-xs font-medium opacity-80">{folder.postCount} Posts</div>
            <div className="text-[10px] opacity-60 mt-1">{folder.description}</div>
        </div>
    </div >
);

const SocialPostCard = ({ post, folders, onDelete, onAssignFolder, onRefresh }: {
    post: SavedPost,
    folders: FeedFolder[],
    onDelete: (id: string) => void,
    onAssignFolder: (postId: string, folderId: string | null) => void,
    onRefresh: (postId: string) => void
}) => {
    const embedRef = useRef<HTMLDivElement>(null);

    // Platform Icon for fallback or badge
    const PlatformIcon = {
        facebook: Facebook,
        instagram: Instagram,
        twitter: Twitter,
        linkedin: Linkedin
    }[post.platform];

    const platformColor = {
        facebook: 'text-blue-600',
        instagram: 'text-pink-600',
        twitter: 'text-slate-900',
        linkedin: 'text-blue-700'
    }[post.platform];

    // Process embeds after component mounts
    useEffect(() => {
        if (!embedRef.current) return;

        const processEmbeds = () => {
            if (post.platform === 'twitter') {
                const twttr = socialWindow().twttr;
                if (twttr?.widgets) {
                    twttr.widgets.load(embedRef.current);
                }
            } else if (post.platform === 'instagram') {
                const instgrm = socialWindow().instgrm;
                if (instgrm?.Embeds) {
                    instgrm.Embeds.process();
                }
            }
        };

        const timer = setTimeout(processEmbeds, 100);
        return () => clearTimeout(timer);
    }, [post.platform, post.url]);

    const getLinkedInEmbedUrl = (url: string) => {
        // Multiple LinkedIn URL formats:
        // 1. https://www.linkedin.com/posts/username_activity-7420329577845166080-KqvP
        // 2. https://www.linkedin.com/feed/update/urn:li:share:7285648585429184512/
        // 3. https://www.linkedin.com/feed/update/urn:li:activity:7285648585429184512/

        const activityMatch = url.match(/activity-(\d{19})/);
        const urnMatch = url.match(/urn:li:(?:share|activity):(\d{19})/);
        const feedUpdateMatch = url.match(/\/feed\/update\/.*?(\d{19})/);

        const id = activityMatch?.[1] || urnMatch?.[1] || feedUpdateMatch?.[1];

        if (id) {
            return `https://www.linkedin.com/embed/feed/update/urn:li:share:${id}`;
        }

        // Log for debugging
        console.warn('LinkedIn ID extraction failed for URL:', url);
        return null;
    };

    const renderEmbed = () => {
        // If we have OG metadata, show preview card
        if (post.ogImage || post.ogTitle) {
            return (
                <a href={post.url} target="_blank" rel="noreferrer" className="block">
                    {post.ogImage && (
                        <div className="relative">
                            <img
                                src={post.ogImage}
                                alt={post.ogTitle || 'Preview'}
                                className="w-full h-auto max-h-[300px] object-cover"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                }}
                            />
                        </div>
                    )}
                    <div className="p-4">
                        {post.ogTitle && (
                            <h3 className="font-semibold text-sm line-clamp-2 mb-1 hover:text-blue-600 transition-colors">
                                {post.ogTitle}
                            </h3>
                        )}
                        {post.ogDescription && (
                            <p className="text-xs text-muted-foreground line-clamp-3">
                                {post.ogDescription}
                            </p>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <span className="truncate max-w-[200px]">
                                {(() => {
                                    try {
                                        return new URL(post.url).hostname;
                                    } catch {
                                        return post.url;
                                    }
                                })()}
                            </span>
                        </div>
                    </div>
                </a>
            );
        }

        // Fallback to basic card if no OG data
        return (
            <a href={post.url} target="_blank" rel="noreferrer" className="block p-4">
                <p className="text-sm mb-2 line-clamp-3">{post.content}</p>
                {post.image && <img src={post.image} alt="content" className="w-full h-auto rounded-md object-cover" />}
                <p className="text-xs text-muted-foreground mt-2">Click to view original</p>
            </a>
        );
    };

    return (
        <div className="tool-surface tool-surface-interactive group relative mb-6 break-inside-avoid overflow-hidden rounded-xl">
            {/* Action Overlay (Visible on Hover) */}
            <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-full bg-white/90 p-1 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100">
                {/* Refresh OG Data Button */}
                {!post.ogImage && !post.ogTitle && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-blue-500 hover:text-blue-600"
                        onClick={() => onRefresh(post.id)}
                        title="Refresh preview"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </Button>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7"><FolderPlus className="w-4 h-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onAssignFolder(post.id, null)}>No Folder</DropdownMenuItem>
                        {folders.map(f => (
                            <DropdownMenuItem key={f.id} onClick={() => onAssignFolder(post.id, f.id)}>{f.name}</DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => onDelete(post.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>

            {/* Embed Content */}
            <div className="w-full bg-slate-50/30" ref={embedRef}>
                {renderEmbed()}
            </div>

            {/* Footer with Metadata */}
            <div className="p-2 border-t bg-slate-50 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    <PlatformIcon className={cn("w-3 h-3", platformColor)} />
                    <span className="capitalize">{post.platform}</span>
                </div>
                {post.folderId && folders.find(f => f.id === post.folderId) && (
                    <Badge variant="outline" className="text-[10px] h-5 px-1 bg-white">
                        {folders.find(f => f.id === post.folderId)?.name}
                    </Badge>
                )}
            </div>
        </div>
    );
};

const FeedMonitor = () => {
    const { toast } = useToast();
    const { refreshEmbeds } = useSocialScripts();
    const { data: dbFolders = [], addFolder, updateFolder, deleteFolder } = useFeedFolders();
    const { data: dbPosts = [], addPost, updatePost, deletePost } = useFeedPosts();
    
    const folders = dbFolders.map(f => ({ id: f.id, name: f.name, description: f.description || '', postCount: 0, color: f.color || 'bg-slate-50 border-slate-100 text-slate-900' }));
    const posts = dbPosts.map(p => ({
        id: p.id,
        platform: p.platform as SavedPost['platform'],
        user: p.og_site_name || p.platform,
        content: p.content || '',
        url: p.url,
        likes: 0, comments: 0, shares: 0, date: p.created_at || 'Just now',
        folderId: p.folder_id || undefined,
        ogTitle: p.og_title || undefined,
        ogDescription: p.og_description || undefined,
        ogImage: p.og_image || undefined,
        ogSiteName: p.og_site_name || undefined
    }));

    useEffect(() => {
        // Refresh social embeds whenever posts update
        setTimeout(refreshEmbeds, 100);
    }, [posts.length, refreshEmbeds]);

    // Initial refresh to ensure existing posts render
    useEffect(() => {
        setTimeout(refreshEmbeds, 1000);
    }, [refreshEmbeds]);
    const [searchUrl, setSearchUrl] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'facebook' | 'instagram' | 'twitter' | 'linkedin'>('all');
    const [selectedFolderFilter, setSelectedFolderFilter] = useState<string>('all'); // For input bar assignment

    // New Folder State
    const [newFolderName, setNewFolderName] = useState('');
    const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);

    // Folder Search
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);

    // Rename Folder State
    const [editingFolder, setEditingFolder] = useState<FeedFolder | null>(null);
    const [renameName, setRenameName] = useState('');
    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<FeedDeleteTarget | null>(null);

    const handleAddPost = async () => {
        if (!searchUrl) {
            toast({ title: "Error", description: "Please enter a URL", variant: "destructive" });
            return;
        }

        let platform: SavedPost['platform'] = 'linkedin'; // Default fallback
        if (searchUrl.includes('facebook.com')) platform = 'facebook';
        else if (searchUrl.includes('instagram.com')) platform = 'instagram';
        else if (searchUrl.includes('twitter.com') || searchUrl.includes('x.com')) platform = 'twitter';
        else if (searchUrl.includes('linkedin.com')) platform = 'linkedin';

        // Show loading toast
        toast({ title: "Fetching...", description: "Getting preview data..." });

        // Fetch OG metadata
        const ogData = await fetchOGMetadata(searchUrl);

        const newPost = {
            platform, content: ogData.description || `Saved from ${searchUrl}`,
            url: searchUrl, folder_id: selectedFolderFilter !== 'all' ? selectedFolderFilter : undefined,
            og_title: ogData.title, og_description: ogData.description, og_image: ogData.image, og_site_name: ogData.siteName
        };

        addPost.mutate(newPost);
        setSearchUrl('');
        toast({ title: "Success", description: ogData.title ? `Added: ${ogData.title.substring(0, 50)}...` : "Post added to feed!" });
    };

    const handleCreateFolder = () => {
        if (!newFolderName) return;
        const randomColor = PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)];
        addFolder.mutate({ name: newFolderName, description: `Created ${formatDate(new Date())}`, color: randomColor });
        setNewFolderName('');
        setIsNewFolderOpen(false);
        toast({ title: "Folder Created", description: `Folder "${newFolderName}" created.` });
    };

    const handleDeletePost = (postId: string) => {
        const post = posts.find(p => p.id === postId);
        setDeleteTarget({
            type: 'post',
            id: postId,
            name: post?.ogTitle || post?.content || 'this saved post',
        });
    };

    const handleAssignFolder = (postId: string, folderId: string | null) => {
        updatePost.mutate({ id: postId, folder_id: folderId || null });
        toast({
            title: "Folder Assigned",
            description: folderId ? `Post moved to ${folders.find(f => f.id === folderId)?.name}` : "Post removed from folder",
        });
    };

    const handleDeleteFolder = (folderId: string) => {
        const folder = folders.find(f => f.id === folderId);
        setDeleteTarget({
            type: 'folder',
            id: folderId,
            name: folder?.name || 'this folder',
        });
    };

    const confirmDeleteTarget = () => {
        if (!deleteTarget) return;
        if (deleteTarget.type === 'post') {
            deletePost.mutate(deleteTarget.id);
            toast({
                title: "Post Deleted",
                description: "The post has been removed from your feed.",
            });
        } else {
            deleteFolder.mutate(deleteTarget.id);
            toast({ title: "Folder Deleted", description: "Folder and associations removed." });
        }
        setDeleteTarget(null);
    };

    const handleRefreshPost = async (postId: string) => {
        const post = posts.find(p => p.id === postId);
        if (!post) return;

        toast({ title: "Refreshing...", description: "Fetching preview data..." });
        const ogData = await fetchOGMetadata(post.url);

        if (ogData.title || ogData.image || ogData.description) {
            updatePost.mutate({
                id: postId,
                og_title: ogData.title,
                og_description: ogData.description,
                og_image: ogData.image,
                og_site_name: ogData.siteName,
                content: ogData.description || post.content
            });
            toast({ title: "Success", description: "Preview updated!" });
        } else {
            toast({ title: "Failed", description: "Could not fetch preview data. Check console for details.", variant: "destructive" });
        }
    };

    const handleRenameFolder = (folderId: string) => {
        const folder = folders.find(f => f.id === folderId);
        if (folder) {
            setEditingFolder(folder);
            setRenameName(folder.name);
            setIsRenameOpen(true);
        }
    };

    const confirmRename = () => {
        if (editingFolder && renameName.trim()) {
            updateFolder.mutate({ id: editingFolder.id, name: renameName });
            setIsRenameOpen(false);
            setEditingFolder(null);
            toast({ title: "Folder Renamed", description: "Folder updated successfully." });
        }
    };

    const filteredPosts = posts.filter(p => {
        const matchesPlatform = activeTab === 'all' || p.platform === activeTab;
        const matchesFolder = selectedFolderFilter === 'all' || p.folderId === selectedFolderFilter;
        return matchesPlatform && matchesFolder;
    });

    const handleFolderClick = (folderId: string) => {
        setSelectedFolderFilter(selectedFolderFilter === folderId ? 'all' : folderId);
    };

    return (
        <AppLayout breadcrumbs={[{ label: 'Tools', path: '#' }, { label: 'Feed Monitor', path: '/tools/feed' }]}>
            <div className="space-y-8 max-w-7xl mx-auto pb-10">

                {/* Header Title */}
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Feed Monitor</h1>
                </div>

                {/* Input Bar */}
                <div className="tool-surface flex items-center gap-4 rounded-2xl p-2">
                    <Input
                        placeholder="Paste the URL Here"
                        className="h-12 flex-1 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
                        value={searchUrl}
                        onChange={(e) => setSearchUrl(e.target.value)}
                    />
                    <Select value={selectedFolderFilter} onValueChange={setSelectedFolderFilter}>
                        <SelectTrigger className="h-10 w-[180px] max-w-[200px] rounded-xl border-0 bg-slate-50">
                            <SelectValue placeholder="Assign to Folder" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">No Folder</SelectItem>
                            {folders.map(f => (
                                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button className="h-10 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-medium gap-2" onClick={handleAddPost}>
                        <Plus className="w-5 h-5 text-white" /> Add Post
                    </Button>
                </div>

                {/* Folders Section */}
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <div className="space-y-1">
                            <h2 className="text-2xl font-bold">Feed Folders</h2>
                            <p className="text-muted-foreground">Here's the collections of your posts.</p>
                        </div>
                        <div className="flex gap-2">
                            <div className={cn("transition-all duration-300 ease-in-out overflow-hidden", isSearchExpanded ? "w-48" : "w-10")}>
                                {isSearchExpanded ? (
                                    <Input
                                        autoFocus
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onBlur={() => !searchQuery && setIsSearchExpanded(false)}
                                        placeholder="Search..."
                                        className="tool-surface h-9 rounded-full"
                                    />
                                ) : (
                                    <Button variant="outline" size="icon" className="tool-surface tool-surface-interactive h-9 w-9 rounded-full" onClick={() => setIsSearchExpanded(true)}>
                                        <Search className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                            <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
                                <DialogTrigger asChild>
                                    <Button className="gap-2 rounded-full bg-primary hover:bg-primary/90 text-white px-6">
                                        <PlusCircle className="w-4 h-4" /> New Folder
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Create New Folder</DialogTitle>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid gap-2">
                                            <Label htmlFor="name">Folder Name</Label>
                                            <Input id="name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="e.g. Design Inspiration" />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleCreateFolder}>Create Folder</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                            <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Rename Folder</DialogTitle>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid gap-2">
                                            <Label htmlFor="rename">Folder Name</Label>
                                            <Input id="rename" value={renameName} onChange={(e) => setRenameName(e.target.value)} />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={confirmRename}>Save Changes</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>

                    <ScrollArea className="w-full whitespace-nowrap pb-4">
                        <div className="flex space-x-4 p-2">
                            {folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map(folder => (
                                <FeedFolderCard
                                    key={folder.id}
                                    folder={{
                                        ...folder,
                                        postCount: posts.filter(p => p.folderId === folder.id).length
                                    }}
                                    onDelete={handleDeleteFolder}
                                    onRename={handleRenameFolder}
                                    onClick={() => handleFolderClick(folder.id)}
                                    isSelected={selectedFolderFilter === folder.id}
                                />
                            ))}
                            {/* Empty Add Card */}
                            <div className="min-w-[100px] p-4 flex items-center justify-center h-32">
                                <Button variant="outline" size="icon" className="tool-surface tool-surface-interactive h-10 w-10 rounded-full border-0" onClick={() => setIsNewFolderOpen(true)}>
                                    <Plus className="w-4 h-4 text-muted-foreground" />
                                </Button>
                            </div>
                        </div>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                </div>

                {/* All Saves / Grid */}
                <div className="space-y-6">
                    <div className="space-y-1">
                        <h2 className="text-2xl font-bold">All Saves</h2>
                        <p className="text-muted-foreground">Here's the collections of all your posts.</p>
                    </div>

                    {/* Tabs / Filters */}
                    <div className="pb-1">
                        {[
                            { id: 'all', label: 'All Posts', icon: null }, // Hidden in design but good for logic, using custom buttons instead as per design
                        ].map(t => null)}

                        {/* Custom Tab mocked from screenshot */}
                        <div className="grid grid-cols-4 w-full gap-4">
                            <Button
                                variant={activeTab === 'facebook' ? 'default' : 'outline'}
                                className={cn("h-12 gap-2 text-sm", activeTab === 'facebook' ? 'bg-blue-600' : 'tool-surface tool-surface-interactive bg-white hover:bg-blue-50/40')}
                                onClick={() => setActiveTab(activeTab === 'facebook' ? 'all' : 'facebook')}
                            >
                                <Facebook className={cn("w-5 h-5", activeTab === 'facebook' ? 'text-white' : 'text-blue-600')} /> Facebook
                            </Button>
                            <Button
                                variant={activeTab === 'instagram' ? 'default' : 'outline'}
                                className={cn("h-12 gap-2 text-sm", activeTab === 'instagram' ? 'bg-pink-600' : 'tool-surface tool-surface-interactive bg-white hover:bg-pink-50/40')}
                                onClick={() => setActiveTab(activeTab === 'instagram' ? 'all' : 'instagram')}
                            >
                                <Instagram className={cn("w-5 h-5", activeTab === 'instagram' ? 'text-white' : 'text-pink-600')} /> Instagram
                            </Button>
                            <Button
                                variant={activeTab === 'twitter' ? 'default' : 'outline'}
                                className={cn("h-12 gap-2 text-sm", activeTab === 'twitter' ? 'bg-slate-900' : 'tool-surface tool-surface-interactive bg-white hover:bg-slate-50')}
                                onClick={() => setActiveTab(activeTab === 'twitter' ? 'all' : 'twitter')}
                            >
                                <Twitter className={cn("w-5 h-5", activeTab === 'twitter' ? 'text-white' : 'text-slate-900')} /> X (Twitter)
                            </Button>
                            <Button
                                variant={activeTab === 'linkedin' ? 'default' : 'outline'}
                                className={cn("h-12 gap-2 text-sm", activeTab === 'linkedin' ? 'bg-blue-700' : 'tool-surface tool-surface-interactive bg-white hover:bg-blue-50/40')}
                                onClick={() => setActiveTab(activeTab === 'linkedin' ? 'all' : 'linkedin')}
                            >
                                <Linkedin className={cn("w-5 h-5", activeTab === 'linkedin' ? 'text-white' : 'text-blue-700')} /> LinkedIn
                            </Button>
                        </div>
                    </div>

                    {/* Grid */}
                    <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-6 [column-fill:_balance]">
                        {filteredPosts.map(post => (
                            <div key={post.id} className="break-inside-avoid">
                                <SocialPostCard post={post} folders={folders} onDelete={handleDeletePost} onAssignFolder={handleAssignFolder} onRefresh={handleRefreshPost} />
                            </div>
                        ))}
                    </div>
                </div>

            </div>
            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent className="border-0 bg-white shadow-2xl sm:rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete {deleteTarget?.type === 'folder' ? 'folder' : 'saved post'}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete "{deleteTarget?.name || 'this item'}". This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deletePost.isPending || deleteFolder.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDeleteTarget}
                            disabled={deletePost.isPending || deleteFolder.isPending}
                            className="bg-red-600 text-white hover:bg-red-700"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
};

export default FeedMonitor;
