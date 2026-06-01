import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Search,
    Folder,
    FileText,
    Layout,
    Calendar as CalendarIcon,
    Hash
} from "lucide-react";
import { useProjects, useAllFolders, useAllCampaigns, useAllContentItems } from '@/hooks/useDatabase';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { campaignPath, folderPath, projectPath } from "@/lib/routes";

export function GlobalCommand() {
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();
    
    const { data: projects = [] } = useProjects();
    const { data: folders = [] } = useAllFolders();
    const { data: campaigns = [] } = useAllCampaigns();
    const { data: contentItems = [] } = useAllContentItems();
    
    // Map existing groups using contentItems
    const blogs = contentItems.filter(i => i.type === 'blog');
    const socialPosts = contentItems.filter(i => i.type === 'social-post');
    const googleAds = contentItems.filter(i => i.type === 'google-ad');
    const socialAds = contentItems.filter(i => i.type === 'social-ad');

    const getFolderPeers = (projectId: string) => folders.filter((folder) => folder.projectId === projectId);
    const getCampaignPeers = (folderId: string) => campaigns.filter((campaign) => campaign.folderId === folderId);

    const getCampaignRoute = (campaignId: string) => {
        const campaign = campaigns.find((item) => item.id === campaignId);
        if (!campaign) return null;

        const folder = folders.find((item) => item.id === campaign.folderId);
        if (!folder) return null;

        const project = projects.find((item) => item.id === folder.projectId);
        if (!project) return null;

        return campaignPath(
            project,
            folder,
            campaign,
            projects,
            getFolderPeers(project.id),
            getCampaignPeers(folder.id),
        );
    };

    const getPayloadText = (payload: Record<string, unknown>, keys: string[]) => {
        for (const key of keys) {
            const value = payload[key];
            if (typeof value === 'string' && value.trim()) return value;
        }
        return '';
    };

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };
        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    const runCommand = (command: () => void) => {
        setOpen(false);
        command();
    };

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-500 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors w-64 border border-slate-200"
            >
                <Search className="w-4 h-4" />
                <span>Search everything...</span>
                <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    <span className="text-xs">⌘</span>K
                </kbd>
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="overflow-hidden p-0 shadow-2xl max-w-2xl">
                    <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
                        <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
                            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                            <CommandInput
                                placeholder="Type a command or search..."
                                className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                        <CommandList className="max-h-[500px] overflow-y-auto overflow-x-hidden p-2">
                            <CommandEmpty>No results found.</CommandEmpty>

                            {/* Projects */}
                            {projects.length > 0 && (
                                <CommandGroup heading="Projects" className="text-xs font-medium text-slate-500 mb-2 px-2 mt-2">
                                    {projects.map((project) => (
                                        <CommandItem
                                            key={project.id}
                                            onSelect={() => runCommand(() => navigate(projectPath(project, projects)))}
                                            className="flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer hover:bg-slate-100 aria-selected:bg-slate-100 data-[selected=true]:bg-slate-100 transition-colors"
                                        >
                                            <Folder className="w-4 h-4 text-blue-500" />
                                            <span>{project.name}</span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            )}

                            {/* Folders */}
                            {folders.length > 0 && (
                                <CommandGroup heading="Folders" className="text-xs font-medium text-slate-500 mb-2 px-2 mt-2">
                                    {folders.map((folder) => (
                                        <CommandItem
                                            key={folder.id}
                                            onSelect={() => runCommand(() => {
                                                const project = projects.find((item) => item.id === folder.projectId);
                                                if (project) navigate(folderPath(project, folder, projects, getFolderPeers(project.id)));
                                            })}
                                            className="flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer hover:bg-slate-100 aria-selected:bg-slate-100 data-[selected=true]:bg-slate-100 transition-colors"
                                        >
                                            <Hash className="w-4 h-4 text-emerald-500" />
                                            <span>{folder.name}</span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            )}

                            {/* Campaigns */}
                            {campaigns.length > 0 && (
                                <CommandGroup heading="Campaigns" className="text-xs font-medium text-slate-500 mb-2 px-2 mt-2">
                                    {campaigns.map((campaign) => (
                                        <CommandItem
                                            key={campaign.id}
                                            onSelect={() => runCommand(() => {
                                                const route = getCampaignRoute(campaign.id);
                                                if (route) navigate(route, { state: { type: campaign.type } });
                                            })}
                                            className="flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer hover:bg-slate-100 aria-selected:bg-slate-100 data-[selected=true]:bg-slate-100 transition-colors"
                                        >
                                            <CalendarIcon className="w-4 h-4 text-purple-500" />
                                            <span>{campaign.name}</span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            )}

                            {/* Content Items */}
                            {blogs.length > 0 && (
                                <CommandGroup heading="Blogs" className="text-xs font-medium text-slate-500 mb-2 px-2 mt-2">
                                    {blogs.map((blog) => (
                                        <CommandItem
                                            key={blog.id}
                                            onSelect={() => runCommand(() => {
                                                const route = getCampaignRoute(blog.campaignId);
                                                if (route) navigate(route, { state: { type: 'blogs' } });
                                            })}
                                            className="flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer hover:bg-slate-100 aria-selected:bg-slate-100 data-[selected=true]:bg-slate-100 transition-colors"
                                        >
                                            <FileText className="w-4 h-4 text-orange-500" />
                                            <span>{getPayloadText(blog.payload, ['title']) || blog.name || "Untitled Blog"}</span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            )}

                            {socialPosts.length > 0 && (
                                <CommandGroup heading="Social Posts" className="text-xs font-medium text-slate-500 mb-2 px-2 mt-2">
                                    {socialPosts.map((post) => (
                                        <CommandItem
                                            key={post.id}
                                            onSelect={() => runCommand(() => {
                                                const route = getCampaignRoute(post.campaignId);
                                                if (route) navigate(route, { state: { type: 'socials' } });
                                            })}
                                            className="flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer hover:bg-slate-100 aria-selected:bg-slate-100 data-[selected=true]:bg-slate-100 transition-colors"
                                        >
                                            <Layout className="w-4 h-4 text-sky-500" />
                                            <span>{getPayloadText(post.payload, ['caption', 'topic']).slice(0, 40) || post.name || "Untitled Post"}</span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            )}
                        </CommandList>
                    </Command>
                </DialogContent>
            </Dialog>
        </>
    );
}
