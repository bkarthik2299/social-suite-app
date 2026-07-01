import { useState, useMemo, useCallback } from 'react';
import { DndContext, DragOverlay, closestCenter, pointerWithin, rectIntersection, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, DragEndEvent, DragStartEvent, type CollisionDetection } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/context/AuthContext';
import { useTasks, useProjects, useAllCampaigns } from '@/hooks/useDatabase';
import { Button } from '@/components/ui/button';
import { PlusCircle, Calendar as CalendarIcon, MoreHorizontal, Settings2, Trash2, Plus, GripVertical, X, User, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Task } from '@/types';

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
};

const taskCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;

  const intersections = rectIntersection(args);
  if (intersections.length > 0) return intersections;

  return closestCenter(args);
};

// Type for column configuration
interface TaskColumn {
  id: string;
  title: string;
  color: string;
}

// Default columns
const DEFAULT_COLUMNS: TaskColumn[] = [
  { id: 'todo', title: 'To-do', color: 'bg-blue-500' },
  { id: 'in-progress', title: 'In Progress', color: 'bg-amber-500' },
  { id: 'done', title: 'Completed', color: 'bg-green-500' },
];

// Available colors for columns
const COLUMN_COLORS = [
  { id: 'blue', class: 'bg-blue-500', label: 'Blue' },
  { id: 'amber', class: 'bg-amber-500', label: 'Amber' },
  { id: 'green', class: 'bg-green-500', label: 'Green' },
  { id: 'purple', class: 'bg-purple-500', label: 'Purple' },
  { id: 'pink', class: 'bg-pink-500', label: 'Pink' },
  { id: 'red', class: 'bg-red-500', label: 'Red' },
  { id: 'cyan', class: 'bg-cyan-500', label: 'Cyan' },
  { id: 'slate', class: 'bg-slate-500', label: 'Slate' },
];

// Sortable Column Item for Customize Columns dialog
function SortableColumnItem({
  column,
  onColorChange,
  onTitleChange,
  onRemove,
  canRemove
}: {
  column: TaskColumn;
  onColorChange: (id: string, color: string) => void;
  onTitleChange: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "tool-surface flex items-center gap-3 rounded-xl p-3",
        isDragging && "shadow-lg ring-2 ring-primary"
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>

      {/* Color Picker */}
      <Select value={column.color} onValueChange={(val) => onColorChange(column.id, val)}>
        <SelectTrigger className="tool-surface h-10 w-[108px] rounded-xl bg-white">
          <div className="flex items-center gap-2">
            <div className={cn("w-3 h-3 rounded-full", column.color)} />
            <span className="text-xs">Color</span>
          </div>
        </SelectTrigger>
        <SelectContent>
          {COLUMN_COLORS.map(color => (
            <SelectItem key={color.id} value={color.class}>
              <div className="flex items-center gap-2">
                <div className={cn("w-3 h-3 rounded-full", color.class)} />
                <span>{color.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Column Name Input */}
      <Input
        value={column.title}
        onChange={(e) => onTitleChange(column.id, e.target.value)}
        className="tool-surface h-10 flex-1 rounded-xl"
        placeholder="Column name"
      />

      {/* Delete Button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-destructive"
        onClick={() => onRemove(column.id)}
        disabled={!canRemove}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

type TaskCardVisualProps = {
  task: Task;
  project?: { name: string };
  campaign?: { name: string; type: string };
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  preview?: boolean;
};

function TaskCardVisual({ task, project, campaign, onEdit, onDelete, preview = false }: TaskCardVisualProps) {
  return (
    <>
      <div className="mb-2 flex items-start justify-between">
        <div className="flex flex-1 items-center gap-2">
          <GripVertical className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <h4
            className="line-clamp-2 cursor-pointer font-medium text-foreground transition-colors hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              if (!preview) onEdit(task);
            }}
          >
            {task.title}
          </h4>
        </div>
        {!preview && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer rounded-lg opacity-0 group-hover:opacity-100 hover:bg-blue-50">
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(task); }}>
                Edit Task
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
              >
                Delete Task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <p className="mb-4 line-clamp-2 text-xs text-muted-foreground">{task.description || "No description provided."}</p>

      <div className="mb-3 flex flex-wrap gap-2">
        {project && <Badge variant="outline" className="h-5 rounded-full border-0 bg-slate-50 text-[10px] text-slate-600">{project.name}</Badge>}
        {campaign && (
          <Badge variant="secondary" className={cn(
            "h-5 rounded-full border-0 text-[10px]",
            campaign.type === 'google-ad' && "bg-badge-google-bg text-badge-google",
            campaign.type === 'meta-ad' && "bg-badge-meta-bg text-badge-meta",
            campaign.type === 'socials' && "bg-badge-socials-bg text-badge-socials",
          )}>
            {campaign.type === 'google-ad' ? 'Google Ad' : campaign.type === 'meta-ad' ? 'Meta Ad' : 'Social Post'}
          </Badge>
        )}
      </div>

      {task.dueDate && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarIcon className="h-3 w-3" />
          <span>{format(new Date(task.dueDate), 'MMM d, yyyy')}</span>
        </div>
      )}
    </>
  );
}

function TaskDragPreview({
  task,
  project,
  campaign,
  width
}: {
  task: Task;
  project?: { name: string };
  campaign?: { name: string; type: string };
  width: number | null;
}) {
  return (
    <div
      style={width ? { width } : undefined}
      className="tool-surface pointer-events-none rounded-xl p-4 shadow-2xl ring-2 ring-primary/30"
    >
      <TaskCardVisual
        task={task}
        project={project}
        campaign={campaign}
        onEdit={() => undefined}
        onDelete={() => undefined}
        preview
      />
    </div>
  );
}

// Task Card Component
function TaskCard({
  task,
  project,
  campaign,
  onEdit,
  onDelete,
  isDragging
}: {
  task: Task;
  project?: { name: string };
  campaign?: { name: string; type: string };
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  isDragging: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task', taskId: task.id, status: task.status },
  });

  const activeDragging = isDragging || isSortableDragging;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isSortableDragging ? undefined : transition,
    willChange: 'transform',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`task-card-${task.id}`}
      {...attributes}
      {...listeners}
      className={cn(
        "tool-surface tool-surface-interactive group touch-none cursor-grab select-none rounded-xl p-4 active:cursor-grabbing",
        activeDragging && "opacity-25 ring-2 ring-primary/20 ring-offset-2 ring-offset-slate-50"
      )}
    >
      <TaskCardVisual
        task={task}
        project={project}
        campaign={campaign}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  );
}

export default function Tasks() {
  const { data: dbTasks, addTask, updateTask, deleteTask, moveTask } = useTasks();
  const { data: projects = [] } = useProjects();
  const { data: campaigns = [] } = useAllCampaigns();
  const { membership, user } = useAuth();
  const { toast } = useToast();

  const currentUserId = user?.id || '';
  const currentUserName = user?.user_metadata?.full_name || user?.email || 'You';
  const teamMembers = useMemo(() => {
    if (!currentUserId) return [];

    return [
      {
        id: currentUserId,
        name: 'You',
        role: membership?.role || 'admin',
        avatar: user?.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserName)}&background=0D8ABC&color=fff`,
      }
    ];
  }, [currentUserId, currentUserName, membership?.role, user?.user_metadata?.avatar_url]);

  const tasks = useMemo(() => dbTasks || [], [dbTasks]);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const [open, setOpen] = useState(false);
  const [columnsDialogOpen, setColumnsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [columnToDelete, setColumnToDelete] = useState<TaskColumn | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverlayWidth, setDragOverlayWidth] = useState<number | null>(null);

  // Filter state - now with arrays for multi-select
  const [filters, setFilters] = useState({
    assignedToMe: false,
    teamMemberIds: [] as string[],
    statuses: [] as string[],
    dueDateRange: '', // 'today', 'week', 'overdue'
    projectIds: [] as string[],
  });

  // Column state
  const [columns, setColumns] = useState<TaskColumn[]>(DEFAULT_COLUMNS);
  const [editingColumns, setEditingColumns] = useState<TaskColumn[]>([]);

  // Form state for create/edit task
  const [taskForm, setTaskForm] = useState({
    title: '',
    status: 'todo',
    projectId: '',
    campaignId: '',
    dueDate: '',
    description: '',
    assigneeId: ''
  });

  const resetTaskForm = useCallback(() => {
    setTaskForm({ title: '', status: 'todo', projectId: '', campaignId: '', dueDate: '', description: '', assigneeId: '' });
  }, []);

  // Filter tasks with multi-select support
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // Assigned to Me filter
      if (filters.assignedToMe && task.assigneeId !== currentUserId) return false;

      // Team member filter (multi-select)
      if (filters.teamMemberIds.length > 0 && !filters.teamMemberIds.includes(task.assigneeId || '')) return false;

      // Status filter (multi-select)
      if (filters.statuses.length > 0 && !filters.statuses.includes(task.status)) return false;

      // Project filter (multi-select)
      if (filters.projectIds.length > 0 && !filters.projectIds.includes(task.projectId || '')) return false;

      // Due date filter
      if (filters.dueDateRange) {
        if (!task.dueDate) return false;
        const dueDate = new Date(task.dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (filters.dueDateRange === 'today') {
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          if (dueDate < today || dueDate >= tomorrow) return false;
        } else if (filters.dueDateRange === 'week') {
          const weekFromNow = new Date(today);
          weekFromNow.setDate(weekFromNow.getDate() + 7);
          if (dueDate < today || dueDate > weekFromNow) return false;
        } else if (filters.dueDateRange === 'overdue') {
          if (dueDate >= today) return false;
        }
      }

      return true;
    });
  }, [tasks, filters, currentUserId]);

  // Check if any filters are active
  const hasActiveFilters = filters.assignedToMe || filters.teamMemberIds.length > 0 || filters.statuses.length > 0 || filters.dueDateRange || filters.projectIds.length > 0;

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      assignedToMe: false,
      teamMemberIds: [],
      statuses: [],
      dueDateRange: '',
      projectIds: [],
    });
  };

  // Toggle multi-select filter
  const toggleTeamMember = (id: string) => {
    setFilters(prev => ({
      ...prev,
      teamMemberIds: prev.teamMemberIds.includes(id)
        ? prev.teamMemberIds.filter(m => m !== id)
        : [...prev.teamMemberIds, id]
    }));
  };

  const toggleStatus = (id: string) => {
    setFilters(prev => ({
      ...prev,
      statuses: prev.statuses.includes(id)
        ? prev.statuses.filter(s => s !== id)
        : [...prev.statuses, id]
    }));
  };

  const toggleProject = (id: string) => {
    setFilters(prev => ({
      ...prev,
      projectIds: prev.projectIds.includes(id)
        ? prev.projectIds.filter(p => p !== id)
        : [...prev.projectIds, id]
    }));
  };

  const handleCreate = async () => {
    const title = taskForm.title.trim();
    if (title) {
      try {
        await addTask.mutateAsync({
          title,
          description: taskForm.description,
          status: taskForm.status,
          due_date: taskForm.dueDate || undefined,
          project_id: taskForm.projectId || undefined,
          campaign_id: taskForm.campaignId || undefined,
          assignee_id: taskForm.assigneeId || undefined,
          sort_order: tasks.length,
        });
        setOpen(false);
        resetTaskForm();
      } catch (error) {
        toast({ title: 'Could not create task', description: getErrorMessage(error), variant: 'destructive' });
      }
    }
  };

  const handleUpdate = async () => {
    const title = taskForm.title.trim();
    if (editingTask && title) {
      try {
        await updateTask.mutateAsync({
          id: editingTask.id,
          updates: {
            title,
            description: taskForm.description,
            status: taskForm.status,
            due_date: taskForm.dueDate || null,
            project_id: taskForm.projectId || null,
            campaign_id: taskForm.campaignId || null,
            assignee_id: taskForm.assigneeId || null,
          }
        });
        setEditingTask(null);
        resetTaskForm();
      } catch (error) {
        toast({ title: 'Could not update task', description: getErrorMessage(error), variant: 'destructive' });
      }
    }
  };

  const openEditDialog = useCallback((task: Task) => {
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      status: task.status,
      projectId: task.projectId || '',
      campaignId: task.campaignId || '',
      dueDate: task.dueDate || '',
      description: task.description || '',
      assigneeId: task.assigneeId || ''
    });
  }, []);

  const closeEditDialog = () => {
    setEditingTask(null);
    resetTaskForm();
  };

  const confirmDeleteTask = () => {
    if (!taskToDelete) return;
    deleteTask.mutate(taskToDelete.id, {
      onError: (error) => {
        toast({ title: 'Could not delete task', description: getErrorMessage(error), variant: 'destructive' });
      },
    });
    if (editingTask?.id === taskToDelete.id) {
      closeEditDialog();
    }
    setTaskToDelete(null);
  };

  // Column customization handlers
  const openColumnsDialog = () => {
    setEditingColumns([...columns]);
    setColumnsDialogOpen(true);
  };

  const addColumn = () => {
    const newId = `column-${Date.now()}`;
    setEditingColumns([...editingColumns, { id: newId, title: 'New Column', color: 'bg-slate-500' }]);
  };

  const updateColumnTitle = (id: string, title: string) => {
    setEditingColumns(editingColumns.map(c => c.id === id ? { ...c, title } : c));
  };

  const updateColumnColor = (id: string, color: string) => {
    setEditingColumns(editingColumns.map(c => c.id === id ? { ...c, color } : c));
  };

  const removeColumn = (id: string) => {
    if (editingColumns.length > 1) {
      setEditingColumns(editingColumns.filter(c => c.id !== id));
    }
  };

  const requestRemoveColumn = (id: string) => {
    const column = editingColumns.find(c => c.id === id);
    if (column) setColumnToDelete(column);
  };

  const confirmRemoveColumn = () => {
    if (!columnToDelete) return;
    removeColumn(columnToDelete.id);
    setColumnToDelete(null);
  };

  const saveColumns = () => {
    setColumns(editingColumns);
    setColumnsDialogOpen(false);
  };

  // Sensors for column drag and drop
  const columnSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const taskSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 3 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle column reorder
  const handleColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setEditingColumns((cols) => {
        const oldIndex = cols.findIndex((c) => c.id === active.id);
        const newIndex = cols.findIndex((c) => c.id === over.id);
        return arrayMove(cols, oldIndex, newIndex);
      });
    }
  };

  const handleTaskDragStart = (event: DragStartEvent) => {
    setDraggingTaskId(String(event.active.id));
    setDragOverlayWidth(event.active.rect.current.initial?.width ?? null);
  };

  const handleTaskDragCancel = () => {
    setDraggingTaskId(null);
    setDragOverlayWidth(null);
  };

  const handleTaskDragEnd = (event: DragEndEvent) => {
    const taskId = String(event.active.id);
    const activeTask = tasksById.get(taskId);
    const overId = event.over ? String(event.over.id) : null;

    if (!activeTask || !overId) {
      setDraggingTaskId(null);
      setDragOverlayWidth(null);
      return;
    }

    const targetTask = tasksById.get(overId);
    const targetStatus = targetTask?.status || columns.find((column) => column.id === overId)?.id;

    if (!targetStatus) {
      setDraggingTaskId(null);
      setDragOverlayWidth(null);
      return;
    }

    const currentOrder = tasks.map((task) => task.id);
    const nextOrder = currentOrder.filter((id) => id !== taskId);

    if (targetTask) {
      const targetIndex = nextOrder.indexOf(targetTask.id);
      nextOrder.splice(targetIndex >= 0 ? targetIndex : nextOrder.length, 0, taskId);
    } else {
      const lastIndexInTargetColumn = nextOrder.reduce((lastIndex, id, index) => {
        return tasksById.get(id)?.status === targetStatus ? index : lastIndex;
      }, -1);
      nextOrder.splice(lastIndexInTargetColumn + 1, 0, taskId);
    }

    const orderChanged = nextOrder.some((id, index) => id !== currentOrder[index]);
    const statusChanged = activeTask.status !== targetStatus;

    if (statusChanged || orderChanged) {
      moveTask.mutate(
        { id: taskId, status: targetStatus, orderedIds: nextOrder },
        {
          onError: (error) => {
            toast({ title: 'Could not move task', description: getErrorMessage(error), variant: 'destructive' });
          },
        }
      );
    }

    setDraggingTaskId(null);
    setDragOverlayWidth(null);
  };

  const StatusColumn = ({ column }: { column: TaskColumn }) => {
    const columnTasks = filteredTasks.filter(t => t.status === column.id);
    const { setNodeRef, isOver } = useDroppable({
      id: column.id,
      data: { type: 'column', columnId: column.id },
    });
    const isActiveDropTarget = Boolean(isOver && draggingTaskId);

    return (
      <div
        ref={setNodeRef}
        data-testid={`task-column-${column.id}`}
        className={cn(
          "tool-surface flex min-w-[300px] flex-1 flex-col gap-4 rounded-xl p-4 transition-all duration-200",
          isActiveDropTarget && "bg-blue-50/60 ring-2 ring-primary/35 ring-offset-2 ring-offset-slate-50"
        )}
      >
        <div className="flex items-center justify-between rounded-xl bg-slate-50/80 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", column.color)} />
            <h3 className="font-semibold text-foreground">{column.title}</h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-muted-foreground shadow-[0_8px_20px_-18px_rgba(37,99,235,0.35),0_1px_2px_rgba(15,23,42,0.04)]">{columnTasks.length}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg hover:bg-blue-50"
            onClick={() => {
              setTaskForm({ ...taskForm, status: column.id });
              setOpen(true);
            }}
          >
            <PlusCircle className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>

        <SortableContext items={columnTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          <div className="min-h-[120px] space-y-3 rounded-xl">
            {columnTasks.map(task => {
              const project = projects.find(p => p.id === task.projectId);
              const campaign = campaigns.find(c => c.id === task.campaignId);

              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  project={project}
                  campaign={campaign}
                  onEdit={openEditDialog}
                  onDelete={() => setTaskToDelete(task)}
                  isDragging={draggingTaskId === task.id}
                />
              );
            })}
            {columnTasks.length === 0 && (
              <div
                className={cn(
                  "flex h-24 items-center justify-center rounded-xl bg-slate-50/70 text-sm text-muted-foreground transition-colors",
                  isActiveDropTarget && "bg-blue-50 text-primary"
                )}
              >
                {isActiveDropTarget ? "Drop here" : "No tasks"}
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    );
  };

  const draggingTask = draggingTaskId ? tasksById.get(draggingTaskId) : undefined;
  const draggingProject = draggingTask ? projects.find(p => p.id === draggingTask.projectId) : undefined;
  const draggingCampaign = draggingTask ? campaigns.find(c => c.id === draggingTask.campaignId) : undefined;

  return (
    <AppLayout breadcrumbs={[{ label: 'Tasks', path: '/tasks' }]}>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">Track team work across projects and campaigns.</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) resetTaskForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-full bg-primary px-6 text-white hover:bg-primary/90">
              <PlusCircle className="h-4 w-4" />
              New Task
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto border-0 bg-slate-50 shadow-2xl sm:max-w-[600px] sm:rounded-2xl">
            <DialogHeader>
              <DialogTitle>Add Task</DialogTitle>
              <DialogDescription>Create a task, assign optional context, and place it on the board.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Task Name</Label>
                  <Input
                    placeholder="Enter Task Name"
                    value={taskForm.title}
                    onChange={e => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                    className="tool-surface h-10 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Project Name</Label>
                  <Select value={taskForm.projectId} onValueChange={val => setTaskForm(prev => ({ ...prev, projectId: val }))}>
                    <SelectTrigger className="tool-surface h-10 rounded-xl bg-white">
                      <SelectValue placeholder="Select an item..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={taskForm.status} onValueChange={val => setTaskForm(prev => ({ ...prev, status: val }))}>
                    <SelectTrigger className="tool-surface h-10 rounded-xl bg-white">
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map(col => (
                        <SelectItem key={col.id} value={col.id}>{col.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assign To</Label>
                  <Select value={taskForm.assigneeId} onValueChange={val => setTaskForm(prev => ({ ...prev, assigneeId: val }))}>
                    <SelectTrigger className="tool-surface h-10 rounded-xl bg-white">
                      <SelectValue placeholder="Select an item..." />
                    </SelectTrigger>
                    <SelectContent>
                      {teamMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "tool-surface h-10 w-full justify-start rounded-xl bg-white text-left font-normal",
                        !taskForm.dueDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {taskForm.dueDate ? format(new Date(taskForm.dueDate), "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={taskForm.dueDate ? new Date(taskForm.dueDate) : undefined}
                      onSelect={(date) => setTaskForm(prev => ({ ...prev, dueDate: date ? format(date, 'yyyy-MM-dd') : '' }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Add a description..."
                  className="tool-surface min-h-[100px] rounded-xl"
                  value={taskForm.description}
                  onChange={e => setTaskForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)} variant="outline" className="tool-surface tool-surface-interactive mr-2 rounded-xl">Cancel</Button>
              <Button onClick={handleCreate} disabled={!taskForm.title.trim() || addTask.isPending}>
                {addTask.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="tool-surface mb-8 flex items-center justify-between gap-2 overflow-x-auto rounded-xl p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground mr-2">Filters:</span>

          <Button
            variant={filters.assignedToMe ? "default" : "outline"}
            size="sm"
            className={cn("rounded-full", !filters.assignedToMe && "tool-surface tool-surface-interactive")}
            onClick={() => setFilters(prev => ({ ...prev, assignedToMe: !prev.assignedToMe }))}
          >
            <User className="w-3 h-3 mr-1" />
            Assigned to Me
          </Button>

          {/* Team Member Filter - Multi-select */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={filters.teamMemberIds.length > 0 ? "default" : "outline"}
                size="sm"
                className={cn("rounded-full", filters.teamMemberIds.length === 0 && "tool-surface tool-surface-interactive")}
              >
                Team Member
                {filters.teamMemberIds.length > 0 && (
                  <span className="ml-1 bg-white/20 px-1.5 rounded-full text-xs">{filters.teamMemberIds.length}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2">
              <div className="space-y-1">
                {teamMembers.map(m => (
                  <div
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-blue-50/70"
                    onClick={() => toggleTeamMember(m.id)}
                  >
                    <Checkbox checked={filters.teamMemberIds.includes(m.id)} />
                    <span className="text-sm">{m.name}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Status Filter - Multi-select */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={filters.statuses.length > 0 ? "default" : "outline"}
                size="sm"
                className={cn("rounded-full", filters.statuses.length === 0 && "tool-surface tool-surface-interactive")}
              >
                Status
                {filters.statuses.length > 0 && (
                  <span className="ml-1 bg-white/20 px-1.5 rounded-full text-xs">{filters.statuses.length}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2">
              <div className="space-y-1">
                {columns.map(col => (
                  <div
                    key={col.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-blue-50/70"
                    onClick={() => toggleStatus(col.id)}
                  >
                    <Checkbox checked={filters.statuses.includes(col.id)} />
                    <div className={cn("w-2 h-2 rounded-full", col.color)} />
                    <span className="text-sm">{col.title}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Due Date Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={filters.dueDateRange ? "default" : "outline"}
                size="sm"
                className={cn("rounded-full", !filters.dueDateRange && "tool-surface tool-surface-interactive")}
              >
                Due Date
                {filters.dueDateRange && <X className="w-3 h-3 ml-1" onClick={(e) => { e.stopPropagation(); setFilters(prev => ({ ...prev, dueDateRange: '' })); }} />}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-2">
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setFilters(prev => ({ ...prev, dueDateRange: 'today' }))}>Today</Button>
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setFilters(prev => ({ ...prev, dueDateRange: 'week' }))}>This Week</Button>
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setFilters(prev => ({ ...prev, dueDateRange: 'overdue' }))}>Overdue</Button>
            </PopoverContent>
          </Popover>

          {/* Project Filter - Multi-select */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={filters.projectIds.length > 0 ? "default" : "outline"}
                size="sm"
                className={cn("rounded-full", filters.projectIds.length === 0 && "tool-surface tool-surface-interactive")}
              >
                Project
                {filters.projectIds.length > 0 && (
                  <span className="ml-1 bg-white/20 px-1.5 rounded-full text-xs">{filters.projectIds.length}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2">
              <div className="space-y-1">
                {projects.map(p => (
                  <div
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-blue-50/70"
                    onClick={() => toggleProject(p.id)}
                  >
                    <Checkbox checked={filters.projectIds.includes(p.id)} />
                    <span className="text-sm">{p.name}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clearFilters}>
              Clear all
            </Button>
          )}
        </div>

        {/* Customize Columns Button */}
        <Button
          variant="outline"
          size="sm"
          className="tool-surface tool-surface-interactive shrink-0 gap-2 rounded-full"
          onClick={openColumnsDialog}
        >
          <Settings2 className="w-4 h-4" />
          Customize Columns
        </Button>
      </div>

      {/* Edit Task Dialog */}
      <Dialog open={!!editingTask} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-0 bg-slate-50 shadow-2xl sm:max-w-[600px] sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>Update task details, assignment, status, or due date.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Task Name</Label>
                <Input
                  placeholder="Enter Task Name"
                  value={taskForm.title}
                  onChange={e => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                  className="tool-surface h-10 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Project Name</Label>
                <Select value={taskForm.projectId} onValueChange={val => setTaskForm(prev => ({ ...prev, projectId: val }))}>
                  <SelectTrigger className="tool-surface h-10 rounded-xl bg-white">
                    <SelectValue placeholder="Select an item..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={taskForm.status} onValueChange={val => setTaskForm(prev => ({ ...prev, status: val }))}>
                  <SelectTrigger className="tool-surface h-10 rounded-xl bg-white">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map(col => (
                      <SelectItem key={col.id} value={col.id}>{col.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assign To</Label>
                <Select value={taskForm.assigneeId} onValueChange={val => setTaskForm(prev => ({ ...prev, assigneeId: val }))}>
                  <SelectTrigger className="tool-surface h-10 rounded-xl bg-white">
                    <SelectValue placeholder="Select an item..." />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "tool-surface h-10 w-full justify-start rounded-xl bg-white text-left font-normal",
                      !taskForm.dueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {taskForm.dueDate ? format(new Date(taskForm.dueDate), "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={taskForm.dueDate ? new Date(taskForm.dueDate) : undefined}
                    onSelect={(date) => setTaskForm(prev => ({ ...prev, dueDate: date ? format(date, 'yyyy-MM-dd') : '' }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Add a description..."
                className="tool-surface min-h-[100px] rounded-xl"
                value={taskForm.description}
                onChange={e => setTaskForm(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              className="mr-auto rounded-xl"
              onClick={() => {
                if (editingTask) {
                  setTaskToDelete(editingTask);
                }
              }}
            >
              Delete
            </Button>
            <Button onClick={closeEditDialog} variant="outline" className="tool-surface tool-surface-interactive mr-2 rounded-xl">Cancel</Button>
            <Button onClick={handleUpdate} disabled={!taskForm.title.trim() || updateTask.isPending}>
              {updateTask.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customize Columns Dialog */}
      <Dialog open={columnsDialogOpen} onOpenChange={setColumnsDialogOpen}>
        <DialogContent className="border-0 bg-slate-50 shadow-2xl sm:max-w-[500px] sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Customize Columns</DialogTitle>
            <DialogDescription>Rename, reorder, add, or remove the visible task board columns.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">Add, remove, or rename your task columns.</p>

            <DndContext
              sensors={columnSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleColumnDragEnd}
            >
              <SortableContext
                items={editingColumns.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {editingColumns.map((col) => (
                    <SortableColumnItem
                      key={col.id}
                      column={col}
                      onColorChange={updateColumnColor}
                      onTitleChange={updateColumnTitle}
                      onRemove={requestRemoveColumn}
                      canRemove={editingColumns.length > 1}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {/* Add Column Button */}
            <Button variant="outline" className="tool-surface tool-surface-interactive w-full gap-2 rounded-xl" onClick={addColumn}>
              <Plus className="w-4 h-4" />
              Add Column
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" className="tool-surface tool-surface-interactive rounded-xl" onClick={() => setColumnsDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveColumns}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kanban Board */}
      <DndContext
        sensors={taskSensors}
        collisionDetection={taskCollisionDetection}
        onDragStart={handleTaskDragStart}
        onDragEnd={handleTaskDragEnd}
        onDragCancel={handleTaskDragCancel}
      >
        <div className="flex flex-1 gap-5 overflow-x-auto pb-8" style={{ minHeight: 'calc(100vh - 300px)' }}>
          {columns.map(column => (
            <StatusColumn key={column.id} column={column} />
          ))}
        </div>
        <DragOverlay
          adjustScale={false}
          dropAnimation={{ duration: 160, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}
        >
          {draggingTask ? (
            <TaskDragPreview
              task={draggingTask}
              project={draggingProject}
              campaign={draggingCampaign}
              width={dragOverlayWidth}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
      <AlertDialog open={!!taskToDelete} onOpenChange={(open) => !open && setTaskToDelete(null)}>
        <AlertDialogContent className="border-0 bg-white shadow-2xl sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{taskToDelete?.title || 'this task'}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTask.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTask}
              disabled={deleteTask.isPending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!columnToDelete} onOpenChange={(open) => !open && setColumnToDelete(null)}>
        <AlertDialogContent className="border-0 bg-white shadow-2xl sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove column?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{columnToDelete?.title || 'this column'}" from your task board layout.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveColumn}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
