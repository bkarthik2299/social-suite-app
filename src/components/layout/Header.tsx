import { ChevronRight } from 'lucide-react';
import { AIAssistant } from '@/components/ai/AIAssistant';
import { GlobalCommand } from '@/components/shared/GlobalCommand';
import { MicroToolsMenu } from '@/components/layout/MicroToolsMenu';
import { Link } from 'react-router-dom';

interface Breadcrumb {
  label: string;
  path: string;
  onClick?: () => void;
}

interface HeaderProps {
  breadcrumbs?: Breadcrumb[];
}

export function Header({ breadcrumbs = [] }: HeaderProps) {
  const defaultBreadcrumbs: Breadcrumb[] = [
    { label: 'App', path: '/' },
  ];

  const allBreadcrumbs = [...defaultBreadcrumbs, ...breadcrumbs];

  return (
    <header className="h-16 bg-background border-b border-border flex items-center justify-between px-6">
      {/* Breadcrumbs (Left) */}
      <nav className="flex items-center gap-2 text-sm min-w-[200px]">
        {allBreadcrumbs.map((crumb, index) => (
          <div key={`${crumb.path}-${crumb.label}-${index}`} className="flex items-center gap-2">
            {index > 0 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            <Link
              to={crumb.path}
              onClick={crumb.onClick}
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

      {/* Global Search (Center) */}
      <div className="flex-1 flex justify-center max-w-2xl px-8">
        <GlobalCommand />
      </div>

      {/* Logo (Right) */}
      <div className="flex items-center justify-end gap-3 min-w-[200px]">
        <AIAssistant />
        <MicroToolsMenu />
        <div className="flex items-center gap-2">
          <img src="/favicon.jpg" alt="Logo" className="w-6 h-6 rounded-md object-cover" />
          <span className="text-xl font-semibold text-foreground tracking-tight">
            socialsuite.
          </span>
        </div>
      </div>
    </header>
  );
}
