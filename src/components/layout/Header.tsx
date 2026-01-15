import { ChevronRight, Search, Command } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface Breadcrumb {
  label: string;
  path: string;
}

interface HeaderProps {
  breadcrumbs?: Breadcrumb[];
}

export function Header({ breadcrumbs = [] }: HeaderProps) {
  const location = useLocation();

  const defaultBreadcrumbs: Breadcrumb[] = [
    { label: 'App', path: '/' },
  ];

  const allBreadcrumbs = [...defaultBreadcrumbs, ...breadcrumbs];

  return (
    <header className="h-16 bg-background border-b border-border flex items-center justify-between px-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm">
        {allBreadcrumbs.map((crumb, index) => (
          <div key={crumb.path} className="flex items-center gap-2">
            {index > 0 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            <Link
              to={crumb.path}
              className={
                index === allBreadcrumbs.length - 1
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground transition-colors"
              }
            >
              {crumb.label}
            </Link>
          </div>
        ))}
      </nav>

      {/* Search & Logo */}
      <div className="flex items-center gap-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Search Campaigns.."
            className="w-64 h-10 pl-4 pr-16 bg-muted/50 border border-border rounded-lg text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-xs text-muted-foreground flex items-center gap-0.5">
              <Command className="w-3 h-3" />
              K
            </kbd>
          </div>
        </div>

        <span className="text-xl font-semibold text-foreground tracking-tight">
          socialsuite.
        </span>
      </div>
    </header>
  );
}
