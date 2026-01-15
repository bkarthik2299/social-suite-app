import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface Breadcrumb {
  label: string;
  path: string;
}

interface AppLayoutProps {
  children: React.ReactNode;
  breadcrumbs?: Breadcrumb[];
}

export function AppLayout({ children, breadcrumbs }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header breadcrumbs={breadcrumbs} />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
