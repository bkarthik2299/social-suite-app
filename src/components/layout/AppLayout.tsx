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
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header breadcrumbs={breadcrumbs} />
        <main className={cn("flex-1 overflow-auto", !noPadding && "p-6")}>
          {children}
        </main>
      </div>
    </div>
  );
}
