import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { FolderCard } from '@/components/shared/FolderCard';
import { projects } from '@/data/mockData';

export default function Projects() {
  return (
    <AppLayout breadcrumbs={[{ label: 'Projects', path: '/projects' }]}>
      <PageHeader title="Projects" actionLabel="New Campaign" />
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-in">
        {projects.map((project) => (
          <FolderCard
            key={project.id}
            id={project.id}
            name={project.name}
            href={`/projects/${project.id}/folders`}
          />
        ))}
      </div>
    </AppLayout>
  );
}
