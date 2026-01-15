import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PageHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function PageHeader({ title, actionLabel, onAction }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-3xl font-bold text-foreground">{title}</h1>
      {actionLabel && (
        <Button onClick={onAction} className="gap-2">
          <Plus className="w-4 h-4" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
