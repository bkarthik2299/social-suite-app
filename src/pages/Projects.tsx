import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { FolderCard } from '@/components/shared/FolderCard';
import { useProjects } from '@/hooks/useDatabase';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { projectPath } from '@/lib/routes';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Projects() {
  const { data: projects, isLoading, addProject, updateProject, deleteProject } = useProjects();
  const [open, setOpen] = useState(false);
  const [projectName, setProjectName] = useState('');

  const handleCreate = () => {
    if (projectName.trim()) {
      addProject.mutate(projectName);
      setProjectName('');
      setOpen(false);
    }
  };

  const handleRename = (id: string, newName: string) => {
    updateProject.mutate({ id, updates: { name: newName } });
  };

  const handleDelete = (id: string) => {
    deleteProject.mutate(id);
  };

  return (
    <AppLayout breadcrumbs={[{ label: 'Projects', path: '/projects' }]}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">Manage your client portfolios and campaigns.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-full bg-primary hover:bg-primary/90 text-white px-6">
              <PlusCircle className="h-4 w-4" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden bg-white shadow-2xl rounded-2xl border-0">
            <div className="p-8 pb-4">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold text-slate-900">Create Project</DialogTitle>
                <DialogDescription className="text-base text-slate-500 mt-1">
                  Add a new project to organize your client portfolios.
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="px-8 pb-8 space-y-6">
              <div className="grid gap-2">
                <Label htmlFor="name" className="text-sm font-semibold text-slate-700 ml-1">
                  Project Name
                </Label>
                <Input
                  id="name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="h-11 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:border-slate-300 focus:ring-0 transition-all font-medium"
                  placeholder="e.g. Acme Corp Marketing"
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleCreate}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 px-6 font-medium shadow-md hover:shadow-lg transition-all"
                >
                  Create Project
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent flex items-center justify-center rounded-full animate-spin"></div>
        </div>
      ) : !projects || projects.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-xl">
          <h3 className="text-lg font-medium text-muted-foreground">No projects yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create your first project to get started</p>
          <Button onClick={() => setOpen(true)}>Create Project</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-in">
          {projects.map((project) => (
            <FolderCard
              key={project.id}
              id={project.id}
              name={project.name}
              href={projectPath(project, projects)}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </AppLayout>
  );
}
