import { useState } from 'react';
import { FolderOpen, CheckSquare, Calendar, Users, ChevronDown, Building2, LogOut, User as UserIcon, MessageSquareText, MoreVertical, Trash2 } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useDeleteAiRun, useAiRuns } from '@/hooks/useAI';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import type { AiRun } from '@/types/ai';

const navItems = [
  { icon: FolderOpen, label: 'Projects', path: '/projects' },
  { icon: CheckSquare, label: 'Tasks', path: '/tasks' },
  { icon: Calendar, label: 'Calendar', path: '/calendar' },
  { icon: Users, label: 'Teams', path: '/teams' },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, organization, signOut } = useAuth();
  const { toast } = useToast();
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [runToDelete, setRunToDelete] = useState<AiRun | null>(null);
  const { data: aiRuns = [] } = useAiRuns(historyExpanded ? 18 : 5);
  const deleteAiRun = useDeleteAiRun();

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  const handleDeleteRun = async () => {
    if (!runToDelete) return;
    try {
      await deleteAiRun.mutateAsync(runToDelete.id);
      toast({ title: 'AI history deleted', description: 'The selected AI mission was removed.' });
      setRunToDelete(null);
    } catch (error) {
      toast({
        title: 'Could not delete AI history',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
    <aside className="flex h-full w-60 flex-col border-r border-blue-100/70 bg-sidebar">
      {/* Organization Header */}
      <div className="shrink-0 px-4 pb-4 pt-7">
        <div className="flex w-full items-center gap-3 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary shadow-sm shadow-blue-300/40">
            <Building2 className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="truncate text-[15px] font-semibold tracking-tight text-foreground">
            {organization?.name || 'Workspace'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 pb-4 pt-3">
        <ul className="space-y-1.5">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={cn(
                  "sidebar-nav-item",
                  isActive(item.path) && "active"
                )}
              >
                <item.icon className="h-[18px] w-[18px]" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mt-5 border-t border-blue-100/80 pt-4">
          <div className="mb-2.5 flex items-center justify-between px-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">AI History</p>
            <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{aiRuns.length}</span>
          </div>
          <div className={cn('space-y-0.5', historyExpanded && 'ai-history-scrollbar max-h-72 overflow-y-auto pr-1')}>
            {aiRuns.map((run) => (
              <div
                key={run.id}
                className="group flex w-full items-start gap-1 rounded-xl px-2 py-2 transition-colors hover:bg-white/70"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-2 text-left text-[11.5px]"
                  onClick={() => window.dispatchEvent(new CustomEvent('socialsuite:open-ai-run', { detail: { runId: run.id } }))}
                >
                  <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500 transition-colors group-hover:text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-[11.5px] font-medium leading-4 text-slate-800">{conversationTitle(run.prompt)}</span>
                    <span className="mt-0.5 block text-[10.5px] leading-3 text-slate-500">{formatHistoryDate(run.created_at)}</span>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 opacity-60 transition-colors hover:bg-white hover:text-slate-700 hover:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-0"
                      aria-label="AI history options"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36 rounded-xl border-0 bg-white p-1 shadow-lg">
                    <DropdownMenuItem
                      className="cursor-pointer gap-2 rounded-lg text-xs text-red-600 focus:bg-red-50 focus:text-red-700"
                      onSelect={() => setRunToDelete(run)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            {!aiRuns.length && (
              <p className="px-2 py-2 text-[11.5px] leading-5 text-slate-500">Your recent AI missions will appear here.</p>
            )}
          </div>
          {aiRuns.length >= 5 && (
            <button
              type="button"
              className="mt-2 px-2 text-[11.5px] font-medium text-primary hover:text-primary/80"
              onClick={() => setHistoryExpanded((expanded) => !expanded)}
            >
              {historyExpanded ? 'Show less' : 'See more'}
            </button>
          )}
        </div>
      </nav>

      {/* User Profile */}
      <div className="shrink-0 border-t border-blue-100/70 p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="soft-card flex w-full items-center gap-3 rounded-2xl p-2.5 text-left text-[13px] transition-colors hover:bg-white">
              <Avatar className="h-8 w-8 shrink-0 border border-white shadow-sm">
                <AvatarImage src={user?.user_metadata?.avatar_url} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs uppercase">
                  {user?.user_metadata?.full_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="truncate text-[13px] font-medium text-foreground">
                  {user?.user_metadata?.full_name || 'My Account'}
                </p>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-white border-slate-100 shadow-md">
            <DropdownMenuItem onClick={() => navigate('/settings')} className="cursor-pointer">
              <UserIcon className="mr-2 h-4 w-4" />
              <span>My Account</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()} className="text-red-600 focus:text-red-600 cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
    <AlertDialog open={!!runToDelete} onOpenChange={(open) => !open && setRunToDelete(null)}>
      <AlertDialogContent className="border-0 bg-white shadow-2xl sm:rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete AI history?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove "{runToDelete ? conversationTitle(runToDelete.prompt) : 'this AI mission'}" and its generated run details.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteAiRun.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteRun}
            disabled={deleteAiRun.isPending}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function conversationTitle(prompt: string) {
  const title = prompt.replace(/\s+/g, ' ').trim();
  return title || 'Untitled AI mission';
}

function formatHistoryDate(value: string | null) {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recent';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
