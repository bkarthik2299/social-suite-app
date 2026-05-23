import { useState } from 'react';
import { Plus, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PageHeaderProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  onRename?: (newName: string) => void;
}

export function PageHeader({ title, description, actionLabel, onAction, onRename }: PageHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);

  const handleSave = () => {
    if (editValue.trim() && onRename) {
      onRename(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  };

  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                className="text-2xl font-bold h-10 w-[300px]"
              />
              <Button size="icon" variant="ghost" onClick={handleSave} className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50">
                <Check className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={handleCancel} className="h-8 w-8 text-slate-500 hover:text-slate-700">
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-foreground">{title}</h1>
              {onRename && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setEditValue(title);
                    setIsEditing(true);
                  }}
                  className="h-8 w-8 text-slate-400 hover:text-primary"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
            </>
          )}
        </div>
        {description && (
          <p className="text-muted-foreground mt-1">{description}</p>
        )}
      </div>

      {actionLabel && (
        <Button onClick={onAction} className="gap-2">
          <Plus className="w-4 h-4" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
