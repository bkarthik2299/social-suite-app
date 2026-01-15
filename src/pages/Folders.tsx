import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { FolderCard } from '@/components/shared/FolderCard';
import { projects, folders } from '@/data/mockData';

export default function Folders() {
  const { projectId } = useParams();
  
  const project = projects.find(p => p.id === projectId);
  const projectFolders = folders.filter(f => f.projectId === projectId);

  if (!project) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-muted-foreground">
          Project not found
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      breadcrumbs={[
        { label: 'Projects', path: '/projects' },
        { label: 'Folders', path: `/projects/${projectId}/folders` },
      ]}
    >
      <PageHeader title="Folders" actionLabel="New Campaign" />
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-in">
        {projectFolders.map((folder) => (
          <FolderCard
            key={folder.id}
            id={folder.id}
            name={folder.name}
            href={`/projects/${projectId}/folders/${folder.id}/campaigns`}
          />
        ))}
      </div>
    </AppLayout>
  );
}
