import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    ArrowRight,
    Calendar as CalendarIcon,
    FileText,
    Folder,
    Hash,
    Layout,
    Megaphone,
    Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAllCampaigns, useAllContentItems, useAllFolders, useProjects } from "@/hooks/useDatabase";
import { cn } from "@/lib/utils";
import { campaignPath, folderPath, projectPath } from "@/lib/routes";

const sectionClassName = "px-2 py-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:pt-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-slate-500";
const itemClassName = "group flex min-w-0 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-blue-50/65 aria-selected:bg-blue-50/80 data-[selected=true]:bg-blue-50/80 data-[selected=true]:text-slate-950";

export function GlobalCommand() {
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();

    const { data: projects = [] } = useProjects();
    const { data: folders = [] } = useAllFolders();
    const { data: campaigns = [] } = useAllCampaigns();
    const { data: contentItems = [] } = useAllContentItems();

    const blogs = contentItems.filter((item) => item.type === 'blog');
    const socialPosts = contentItems.filter((item) => item.type === 'social-post');
    const googleAds = contentItems.filter((item) => item.type === 'google-ad');
    const socialAds = contentItems.filter((item) => item.type === 'social-ad');

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
            if (typeof value === 'string' && value.trim()) return value.trim();
        }
        return '';
    };

    const getFolderContext = (projectId: string) => {
        return projects.find((item) => item.id === projectId)?.name || '';
    };

    const getCampaignContext = (campaignId: string) => {
        const campaign = campaigns.find((item) => item.id === campaignId);
        if (!campaign) return '';

        const folder = folders.find((item) => item.id === campaign.folderId);
        const project = folder ? projects.find((item) => item.id === folder.projectId) : null;
        return [project?.name, folder?.name, campaign.name].filter(Boolean).join(' / ');
    };

    useEffect(() => {
        const down = (event: KeyboardEvent) => {
            if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                setOpen((current) => !current);
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
                type="button"
                aria-label="Open universal search"
                onClick={() => setOpen(true)}
                className="group flex h-10 w-full max-w-sm items-center gap-2.5 rounded-full bg-white px-3.5 text-sm text-slate-500 shadow-[0_10px_28px_-24px_rgba(37,99,235,0.42),0_1px_3px_rgba(15,23,42,0.05)] transition-shadow hover:shadow-[0_18px_42px_-26px_rgba(37,99,235,0.52),0_10px_24px_-22px_rgba(15,23,42,0.18)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
            >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary transition-colors group-hover:bg-blue-100">
                    <Search className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-left font-medium">Search everything</span>
                <kbd className="pointer-events-none hidden h-6 select-none items-center gap-1 rounded-full bg-slate-50 px-2 font-mono text-[10px] font-semibold text-slate-500 shadow-[0_8px_18px_-16px_rgba(37,99,235,0.45),0_1px_2px_rgba(15,23,42,0.04)] sm:inline-flex">
                    Ctrl K
                </kbd>
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-[min(92vw,42rem)] overflow-hidden border-0 bg-white p-0 shadow-[0_28px_70px_-36px_rgba(37,99,235,0.58),0_18px_48px_-40px_rgba(15,23,42,0.28)] sm:rounded-2xl [&>button:last-child]:right-4 [&>button:last-child]:top-4 [&>button:last-child]:rounded-full [&>button:last-child]:bg-slate-50 [&>button:last-child]:p-2 [&>button:last-child]:text-slate-500 [&>button:last-child]:opacity-100 [&>button:last-child]:shadow-sm [&>button:last-child]:hover:bg-blue-50 [&>button:last-child]:hover:text-primary">
                    <DialogTitle className="sr-only">Universal Search</DialogTitle>
                    <DialogDescription className="sr-only">Search projects, folders, campaigns, and content.</DialogDescription>
                    <Command className="rounded-2xl bg-white text-slate-900 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-1 [&_[cmdk-input-wrapper]]:border-0 [&_[cmdk-input-wrapper]]:px-5 [&_[cmdk-input-wrapper]]:py-4 [&_[cmdk-input-wrapper]_svg]:mr-3 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input-wrapper]_svg]:text-primary [&_[cmdk-input-wrapper]_svg]:opacity-100 [&_[cmdk-input]]:h-12 [&_[cmdk-input]]:text-[15px] [&_[cmdk-input]]:font-medium [&_[cmdk-input]]:placeholder:text-slate-400">
                        <div className="bg-slate-50/70">
                            <CommandInput placeholder="Type to search projects, campaigns, or content..." />
                        </div>
                        <CommandList className="command-search-scrollbar max-h-[min(62vh,520px)] overflow-y-auto overflow-x-hidden p-2.5 pr-3">
                            <CommandEmpty className="py-12 text-center">
                                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-primary">
                                    <Search className="h-5 w-5" />
                                </div>
                                <p className="text-sm font-semibold text-slate-700">No results found</p>
                                <p className="mt-1 text-xs text-slate-500">Try a project, campaign, folder, or content title.</p>
                            </CommandEmpty>

                            {projects.length > 0 && (
                                <CommandGroup heading="Projects" className={sectionClassName}>
                                    {projects.map((project) => (
                                        <SearchResultItem
                                            key={project.id}
                                            icon={Folder}
                                            iconClassName="bg-blue-50 text-blue-600"
                                            title={project.name}
                                            detail={`${getFolderPeers(project.id).length} folders`}
                                            onSelect={() => runCommand(() => navigate(projectPath(project, projects)))}
                                        />
                                    ))}
                                </CommandGroup>
                            )}

                            {folders.length > 0 && (
                                <CommandGroup heading="Folders" className={sectionClassName}>
                                    {folders.map((folder) => (
                                        <SearchResultItem
                                            key={folder.id}
                                            icon={Hash}
                                            iconClassName="bg-emerald-50 text-emerald-600"
                                            title={folder.name}
                                            detail={getFolderContext(folder.projectId)}
                                            onSelect={() => runCommand(() => {
                                                const project = projects.find((item) => item.id === folder.projectId);
                                                if (project) navigate(folderPath(project, folder, projects, getFolderPeers(project.id)));
                                            })}
                                        />
                                    ))}
                                </CommandGroup>
                            )}

                            {campaigns.length > 0 && (
                                <CommandGroup heading="Campaigns" className={sectionClassName}>
                                    {campaigns.map((campaign) => (
                                        <SearchResultItem
                                            key={campaign.id}
                                            icon={CalendarIcon}
                                            iconClassName="bg-violet-50 text-violet-600"
                                            title={campaign.name}
                                            detail={getCampaignContext(campaign.id)}
                                            onSelect={() => runCommand(() => {
                                                const route = getCampaignRoute(campaign.id);
                                                if (route) navigate(route, { state: { type: campaign.type } });
                                            })}
                                        />
                                    ))}
                                </CommandGroup>
                            )}

                            {blogs.length > 0 && (
                                <CommandGroup heading="Blogs" className={sectionClassName}>
                                    {blogs.map((blog) => (
                                        <SearchResultItem
                                            key={blog.id}
                                            icon={FileText}
                                            iconClassName="bg-orange-50 text-orange-600"
                                            title={getPayloadText(blog.payload, ['title']) || blog.name || "Untitled Blog"}
                                            detail={getCampaignContext(blog.campaignId)}
                                            onSelect={() => runCommand(() => {
                                                const route = getCampaignRoute(blog.campaignId);
                                                if (route) navigate(route, { state: { type: 'blogs' } });
                                            })}
                                        />
                                    ))}
                                </CommandGroup>
                            )}

                            {socialPosts.length > 0 && (
                                <CommandGroup heading="Social Posts" className={sectionClassName}>
                                    {socialPosts.map((post) => (
                                        <SearchResultItem
                                            key={post.id}
                                            icon={Layout}
                                            iconClassName="bg-sky-50 text-sky-600"
                                            title={getPayloadText(post.payload, ['topic', 'caption']).slice(0, 80) || post.name || "Untitled Post"}
                                            detail={getCampaignContext(post.campaignId)}
                                            onSelect={() => runCommand(() => {
                                                const route = getCampaignRoute(post.campaignId);
                                                if (route) navigate(route, { state: { type: 'socials' } });
                                            })}
                                        />
                                    ))}
                                </CommandGroup>
                            )}

                            {googleAds.length > 0 && (
                                <CommandGroup heading="Google Ads" className={sectionClassName}>
                                    {googleAds.map((ad) => (
                                        <SearchResultItem
                                            key={ad.id}
                                            icon={Search}
                                            iconClassName="bg-amber-50 text-amber-600"
                                            title={getPayloadText(ad.payload, ['topic', 'name', 'headline1', 'headline']).slice(0, 80) || ad.name || "Untitled Google Ad"}
                                            detail={getCampaignContext(ad.campaignId)}
                                            onSelect={() => runCommand(() => {
                                                const route = getCampaignRoute(ad.campaignId);
                                                if (route) navigate(route, { state: { type: 'google-ad' } });
                                            })}
                                        />
                                    ))}
                                </CommandGroup>
                            )}

                            {socialAds.length > 0 && (
                                <CommandGroup heading="Social Media Ads" className={sectionClassName}>
                                    {socialAds.map((ad) => (
                                        <SearchResultItem
                                            key={ad.id}
                                            icon={Megaphone}
                                            iconClassName="bg-rose-50 text-rose-600"
                                            title={getPayloadText(ad.payload, ['topic', 'creativeBrief', 'adCreative']).slice(0, 80) || ad.name || "Untitled Social Ad"}
                                            detail={getCampaignContext(ad.campaignId)}
                                            onSelect={() => runCommand(() => {
                                                const route = getCampaignRoute(ad.campaignId);
                                                if (route) navigate(route, { state: { type: 'meta-ad' } });
                                            })}
                                        />
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

function SearchResultItem({
    icon: Icon,
    iconClassName,
    title,
    detail,
    onSelect,
}: {
    icon: LucideIcon;
    iconClassName: string;
    title: string;
    detail?: string;
    onSelect: () => void;
}) {
    const value = [title, detail].filter(Boolean).join(' ');

    return (
        <CommandItem value={value} onSelect={onSelect} className={itemClassName}>
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", iconClassName)}>
                <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-slate-900">{title}</span>
                {detail && <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">{detail}</span>}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-primary" />
        </CommandItem>
    );
}
