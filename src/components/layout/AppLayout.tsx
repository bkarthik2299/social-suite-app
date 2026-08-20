import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';

interface Breadcrumb {
  label: string;
  path: string;
  onClick?: () => void;
}

interface AppLayoutProps {
  children: React.ReactNode;
  breadcrumbs?: Breadcrumb[];
  noPadding?: boolean;
}

export function AppLayout({ children, breadcrumbs, noPadding = false }: AppLayoutProps) {
  return (
    <div className="fixed inset-0 flex min-h-0 w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header breadcrumbs={breadcrumbs} />
        <main className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden", !noPadding && "p-6")}>
          {children}
        </main>
      </div>
    </div>
  );
}
