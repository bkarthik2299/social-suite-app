import { useState } from 'react';
import { FolderOpen, CheckSquare, Calendar, Users, ChevronDown, Building2, LogOut, User as UserIcon, MessageSquareText } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useAiRuns } from '@/hooks/useAI';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

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
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const { data: aiRuns = [] } = useAiRuns(historyExpanded ? 18 : 5);

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="w-56 h-full bg-sidebar flex flex-col border-r border-border/50">
      {/* Organization Header */}
      <div className="p-4 shrink-0">
        <div className="flex items-center gap-3 w-full p-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm">
            <Building2 className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground tracking-tight truncate">
            {organization?.name || 'Workspace'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto custom-scrollbar">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={cn(
                  "sidebar-nav-item",
                  isActive(item.path) && "active"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mt-5 border-t border-border/60 pt-4">
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">AI History</p>
            <span className="text-[11px] text-muted-foreground">{aiRuns.length}</span>
          </div>
          <div className={cn('space-y-1', historyExpanded && 'max-h-72 overflow-y-auto pr-1 custom-scrollbar')}>
            {aiRuns.map((run) => (
              <button
                key={run.id}
                type="button"
                className="group flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-active-bg/60"
                onClick={() => window.dispatchEvent(new CustomEvent('socialsuite:open-ai-run', { detail: { runId: run.id } }))}
              >
                <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground">{conversationTitle(run.prompt)}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{formatHistoryDate(run.created_at)}</span>
                </span>
              </button>
            ))}
            {!aiRuns.length && (
              <p className="px-2 py-2 text-xs leading-5 text-muted-foreground">Your recent AI missions will appear here.</p>
            )}
          </div>
          {aiRuns.length >= 5 && (
            <button
              type="button"
              className="mt-2 px-2 text-xs font-medium text-primary hover:text-primary/80"
              onClick={() => setHistoryExpanded((expanded) => !expanded)}
            >
              {historyExpanded ? 'Show less' : 'See more'}
            </button>
          )}
        </div>
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-border/50 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-sidebar-active-bg/50 transition-colors">
              <Avatar className="w-8 h-8 border border-border/50 shrink-0">
                <AvatarImage src={user?.user_metadata?.avatar_url} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs uppercase">
                  {user?.user_metadata?.full_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left overflow-hidden">
                <p className="text-sm font-medium text-foreground truncate">
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
