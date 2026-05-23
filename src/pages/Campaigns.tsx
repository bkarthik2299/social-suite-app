import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MoreHorizontal, ChevronLeft, ChevronRight, PlusCircle, FileText, Search, Calendar, Infinity as InfinityIcon, ArrowUpDown, Pencil, Trash2, Share2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { CampaignBadge } from '@/components/shared/CampaignBadge';
import { useProjects, useFolders, useCampaigns } from '@/hooks/useDatabase';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { campaignPath, findBySlug, folderPath, projectPath } from '@/lib/routes';
import { Campaign } from '@/types';

export default function Campaigns() {
  const { projectId, folderId } = useParams();
  const navigate = useNavigate();
  const { data: projects = [], isLoading: isLoadingProjects } = useProjects();
  const project = findBySlug(projects, projectId);
  const { data: folders = [], isLoading: isLoadingFolders } = useFolders(project?.id || '');
  const folder = findBySlug(folders, folderId);
  const { data: campaigns, isLoading, addCampaign, updateCampaign, deleteCampaign } = useCampaigns(folder?.id || '');

  const [open, setOpen] = useState(false);

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Rename State
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [campaignToRename, setCampaignToRename] = useState<Campaign | null>(null);
  const [newName, setNewName] = useState('');

  // Delete State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<string | null>(null);

  const folderCampaigns = useMemo(() => campaigns || [], [campaigns]);

  // Sort Logic
  const sortedCampaigns = useMemo(() => {
    const sortableItems = [...folderCampaigns];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const aValue = a[sortConfig.key as keyof Campaign];
        const bValue = b[sortConfig.key as keyof Campaign];

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [folderCampaigns, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleRenameClick = (campaign: Campaign) => {
    setCampaignToRename(campaign);
    setNewName(campaign.name);
    setRenameDialogOpen(true);
  };

  const saveRename = () => {
    if (campaignToRename && newName.trim()) {
      updateCampaign.mutate({ id: campaignToRename.id, updates: { name: newName } });
      setRenameDialogOpen(false);
      setCampaignToRename(null);
    }
  };

  const handleDeleteClick = (id: string) => {
    setCampaignToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (campaignToDelete) {
      deleteCampaign.mutate(campaignToDelete);
      setDeleteDialogOpen(false);
      setCampaignToDelete(null);
    }
  };

  // Generate a default name like "Untitled 1", "Untitled 2"
  const getNextUntitledName = () => {
    const untitledCount = folderCampaigns.filter(c => c.name.startsWith('Untitled')).length;
    return untitledCount === 0 ? 'Untitled' : `Untitled ${untitledCount + 1}`;
  };

  const handleTypeSelect = async (type: 'socials' | 'google-ad' | 'meta-ad' | 'blogs') => {
    if (project && folder) {
      const name = getNextUntitledName();

      const newCampaign = await addCampaign.mutateAsync({
        name,
        type,
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      setOpen(false);
      navigate(campaignPath(project, folder, newCampaign, projects, folders, [...folderCampaigns, newCampaign]), {
        state: { autoCreate: true, type }
      });
    }
  };

  if (isLoadingProjects || isLoadingFolders) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Projects', path: '/projects' }]}>
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!project || !folder) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Projects', path: '/projects' }]}>
        <div className="text-center py-12 text-muted-foreground">
          Folder not found
        </div>
      </AppLayout>
    );
  }

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM dd, yyyy');
    } catch (e) {
      return '-';
    }
  };

  const getBadgeLabel = (type: string, name: string) => {
    if (type === 'socials') return 'Social Media Post';
    if (type === 'google-ad') return 'Google Ad';
    if (type === 'meta-ad') return 'Social Media Ad';
    if (type === 'blogs') return 'Blog';
    return 'Content';
  };

  const campaignOptions = [
    { id: 'meta-ad', label: 'Social Media Ads', description: 'Create ads for LinkedIn, Instagram, Facebook, and X.', icon: Share2, color: 'text-blue-600 bg-blue-50', hoverColor: 'group-hover:bg-blue-600 group-hover:text-white' },
    { id: 'socials', label: 'Social Media Post', description: 'Schedule posts across multiple platforms.', icon: Calendar, color: 'text-sky-600 bg-sky-50', hoverColor: 'group-hover:bg-sky-600 group-hover:text-white' },
    { id: 'google-ad', label: 'Google Ads', description: 'Launch and manage search engine campaigns.', icon: Search, color: 'text-amber-600 bg-amber-50', hoverColor: 'group-hover:bg-amber-600 group-hover:text-white' },
    { id: 'blogs', label: 'Blogs', description: 'Write and publish articles for your website.', icon: FileText, color: 'text-emerald-600 bg-emerald-50', hoverColor: 'group-hover:bg-emerald-600 group-hover:text-white' },
  ] as const;

  return (
    <AppLayout
      breadcrumbs={[
        { label: 'Projects', path: '/projects' },
        { label: project.name, path: projectPath(project, projects) },
        { label: folder.name, path: folderPath(project, folder, projects, folders) },
      ]}
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content</h1>
          <p className="text-muted-foreground">Manage specific marketing initiatives.</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-primary hover:bg-primary/90 rounded-full px-6">
              <PlusCircle className="h-4 w-4" />
              New Content
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden gap-0 bg-white shadow-2xl rounded-2xl border-0">
            <div className="p-8 pb-4 flex justify-between items-start">
              <div>
                <DialogTitle className="text-2xl font-bold text-slate-900">New Content</DialogTitle>
                <DialogDescription className="text-base text-slate-500 mt-1">
                  What would you like to work on?
                </DialogDescription>
              </div>
            </div>

            <div className="px-8 pb-8 space-y-4">
              {campaignOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleTypeSelect(option.id)}
                  className="w-full flex items-center gap-5 p-5 bg-white rounded-xl border border-slate-200 text-left transition-all duration-200 group hover:border-blue-500 hover:shadow-md hover:ring-1 hover:ring-blue-500"
                >
                  <div className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors duration-200", option.color, option.hoverColor)}>
                    <option.icon className="w-6 h-6" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-lg text-slate-900 mb-1">{option.label}</h4>
                    <p className="text-sm text-slate-500">{option.description}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden animate-fade-in shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="font-semibold text-foreground cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort('name')}>
                <div className="flex items-center gap-1">Content <ArrowUpDown className="w-3 h-3" /></div>
              </TableHead>
              <TableHead className="font-semibold text-foreground cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort('type')}>
                <div className="flex items-center gap-1">Type <ArrowUpDown className="w-3 h-3" /></div>
              </TableHead>
              <TableHead className="font-semibold text-foreground cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort('deadline')}>
                <div className="flex items-center gap-1">Date <ArrowUpDown className="w-3 h-3" /></div>
              </TableHead>
              <TableHead className="font-semibold text-foreground cursor-pointer hover:text-primary transition-colors" onClick={() => requestSort('createdAt')}>
                <div className="flex items-center gap-1">Created on <ArrowUpDown className="w-3 h-3" /></div>
              </TableHead>
              <TableHead className="font-semibold text-foreground">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  <div className="flex justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
                </TableCell>
              </TableRow>
            ) : sortedCampaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No content found. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              sortedCampaigns.map((campaign) => (
                <TableRow
                  key={campaign.id}
                  className="hover:bg-muted/20 cursor-pointer"
                  onClick={() => navigate(campaignPath(project, folder, campaign, projects, folders, folderCampaigns), { state: { type: campaign.type } })}
                >
                  <TableCell className="font-medium text-foreground pl-6">
                    {campaign.name}
                  </TableCell>
                  <TableCell>
                    <CampaignBadge
                      type={campaign.type}
                      label={getBadgeLabel(campaign.type, campaign.name)}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(campaign.deadline)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(campaign.createdAt)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRenameClick(campaign); }}>
                          <Pencil className="w-4 h-4 mr-2" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={(e) => { e.stopPropagation(); handleDeleteClick(campaign.id); }}>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename Content</DialogTitle>
            <DialogDescription>
              Enter a new name for your content.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="col-span-3"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveRename}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the content and remove its data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
