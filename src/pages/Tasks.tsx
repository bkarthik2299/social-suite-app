import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { tasks } from '@/data/mockData';
import { CheckCircle2, Circle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusConfig = {
  'todo': { icon: Circle, label: 'To Do', className: 'text-muted-foreground' },
  'in-progress': { icon: Clock, label: 'In Progress', className: 'text-primary' },
  'done': { icon: CheckCircle2, label: 'Done', className: 'text-badge-socials' },
};

export default function Tasks() {
  return (
    <AppLayout breadcrumbs={[{ label: 'Task', path: '/tasks' }]}>
      <PageHeader title="Tasks" actionLabel="New Task" />
      
      <div className="space-y-3 animate-fade-in">
        {tasks.map((task) => {
          const config = statusConfig[task.status];
          const Icon = config.icon;
          
          return (
            <div
              key={task.id}
              className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:shadow-sm transition-shadow"
            >
              <Icon className={cn("w-5 h-5", config.className)} />
              <div className="flex-1">
                <h3 className="font-medium text-foreground">{task.title}</h3>
                {task.dueDate && (
                  <p className="text-sm text-muted-foreground">Due: {task.dueDate}</p>
                )}
              </div>
              <span className={cn("text-sm font-medium", config.className)}>
                {config.label}
              </span>
            </div>
          );
        })}
      </div>
    </AppLayout>
  );
}
