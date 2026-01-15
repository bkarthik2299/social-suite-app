import { FolderOpen, CheckSquare, Calendar, Users, ChevronDown } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const navItems = [
  { icon: FolderOpen, label: 'Projects', path: '/projects' },
  { icon: CheckSquare, label: 'Task', path: '/tasks' },
  { icon: Calendar, label: 'Calendar', path: '/calendar' },
  { icon: Users, label: 'Teams', path: '/teams' },
];

export function Sidebar() {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="w-56 min-h-screen bg-sidebar flex flex-col">
      {/* Organization Header */}
      <div className="p-4">
        <button className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-sidebar-active-bg/50 transition-colors">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <FolderOpen className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground">Grustl. Inc</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
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
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-border/50">
        <button className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-sidebar-active-bg/50 transition-colors">
          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-primary">L</span>
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-foreground">Leo Parthiban</p>
            <p className="text-xs text-muted-foreground">leodas213@gmail.com</p>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </aside>
  );
}
