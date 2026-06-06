import { useState, useMemo, useCallback } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AppLayout } from '@/components/layout/AppLayout';
import { useTasks, useProjects, useAllCampaigns } from '@/hooks/useDatabase';
import { Button } from '@/components/ui/button';
import { PlusCircle, Calendar as CalendarIcon, MoreHorizontal, Settings2, Trash2, Plus, GripVertical, X, User, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
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
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Task } from '@/types';

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
  { id: 'completed', title: 'Completed', color: 'bg-green-500' },
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
        "flex items-center gap-3 p-3 bg-muted/50 rounded-lg",
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
        <SelectTrigger className="w-[100px]">
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
        className="flex-1"
        placeholder="Column name"
      />

      {/* Delete Button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(column.id)}
        disabled={!canRemove}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
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
  onDragStart,
  onDragEnd,
  onDrop,
  isDragging
}: {
  task: Task;
  project?: { name: string };
  campaign?: { name: string; type: string };
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, task: Task) => void;
  onDragEnd: () => void;
  onDrop?: (e: React.DragEvent, targetTask: Task) => void;
  isDragging: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        if (onDrop) onDrop(e, task);
      }}
      className={cn(
        "bg-card p-4 rounded-xl border border-border shadow-sm hover:shadow-md transition-all group select-none cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50 scale-95",
        isDragOver && "border-t-4 border-t-primary"
      )}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 flex-1">
          <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <h4
            className="font-medium text-foreground line-clamp-2 cursor-pointer hover:text-primary transition-colors"
            onClick={(e) => { e.stopPropagation(); onEdit(task); }}
          >
            {task.title}
          </h4>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 cursor-pointer">
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
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
      </div>

      <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{task.description || "No description provided."}</p>

      <div className="flex flex-wrap gap-2 mb-3">
        {project && <Badge variant="outline" className="text-[10px] h-5">{project.name}</Badge>}
        {campaign && (
          <Badge variant="secondary" className={cn(
            "text-[10px] h-5",
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
          <CalendarIcon className="w-3 h-3" />
          <span>{format(new Date(task.dueDate), 'MMM d, yyyy')}</span>
        </div>
      )}
    </div>
  );
}

export default function Tasks() {
  const { data: dbTasks, isLoading, addTask, updateTask, deleteTask, reorderTasks } = useTasks();
  const { data: projects = [] } = useProjects();
  const { data: campaigns = [] } = useAllCampaigns();

  const teamMembers = useMemo(() => [
    { id: 'tm-1', name: 'You', role: 'admin', avatar: 'https://ui-avatars.com/api/?name=You&background=0D8ABC&color=fff' }
  ], []);

  const tasks = useMemo(() => dbTasks || [], [dbTasks]);
  const [open, setOpen] = useState(false);
  const [columnsDialogOpen, setColumnsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [columnToDelete, setColumnToDelete] = useState<TaskColumn | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

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

  // Filter tasks with multi-select support
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // Assigned to Me filter
      if (filters.assignedToMe && task.assigneeId !== 'tm-1') return false;

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
  }, [tasks, filters]);

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

  const handleCreate = () => {
    if (taskForm.title) {
      addTask.mutate({
        title: taskForm.title,
        description: taskForm.description,
        status: taskForm.status,
        due_date: taskForm.dueDate || undefined,
        project_id: taskForm.projectId || undefined,
        campaign_id: taskForm.campaignId || undefined,
        assignee_id: taskForm.assigneeId || undefined,
      });
      setOpen(false);
      setTaskForm({ title: '', status: 'todo', projectId: '', campaignId: '', dueDate: '', description: '', assigneeId: '' });
    }
  };

  const handleUpdate = () => {
    if (editingTask && taskForm.title) {
      updateTask.mutate({
        id: editingTask.id,
        updates: {
          title: taskForm.title,
          description: taskForm.description,
          status: taskForm.status,
          due_date: taskForm.dueDate || null,
          project_id: taskForm.projectId || null,
          campaign_id: taskForm.campaignId || null,
          assignee_id: taskForm.assigneeId || null,
        }
      });
      setEditingTask(null);
      setTaskForm({ title: '', status: 'todo', projectId: '', campaignId: '', dueDate: '', description: '', assigneeId: '' });
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
    setTaskForm({ title: '', status: 'todo', projectId: '', campaignId: '', dueDate: '', description: '', assigneeId: '' });
  };

  const confirmDeleteTask = () => {
    if (!taskToDelete) return;
    deleteTask.mutate(taskToDelete.id);
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

  // Native HTML Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, task: Task) => {
    e.dataTransfer.setData('taskId', task.id);
    e.dataTransfer.effectAllowed = 'move';

    // Defer state update to next tick to allow browser to generate drag image first
    // This prevents the "ghost" image from being the opacity-50 version and reduces hiccups
    setTimeout(() => {
      setDraggingTaskId(task.id);
    }, 0);
  };

  const handleDragEnd = () => {
    setDraggingTaskId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      updateTask.mutate({ id: taskId, updates: { status: columnId } });
      const newOrder = tasks.filter(t => t.id !== taskId).map(t => t.id);
      newOrder.push(taskId); 
      reorderTasks.mutate(newOrder);
    }
    setDraggingTaskId(null);
  };

  const handleTaskDrop = (e: React.DragEvent, targetTask: Task) => {
    e.preventDefault();
    e.stopPropagation(); 

    const sourceTaskId = e.dataTransfer.getData('taskId');
    if (sourceTaskId === targetTask.id) return; 

    updateTask.mutate({ id: sourceTaskId, updates: { status: targetTask.status } });
    
    const updatedOrder = tasks.map(t => t.id).filter(id => id !== sourceTaskId);
    const targetIndex = updatedOrder.indexOf(targetTask.id);
    updatedOrder.splice(targetIndex, 0, sourceTaskId);
    
    reorderTasks.mutate(updatedOrder);
    setDraggingTaskId(null);
  };

  const StatusColumn = ({ column }: { column: TaskColumn }) => {
    const columnTasks = filteredTasks.filter(t => t.status === column.id);
    const [isDragOver, setIsDragOver] = useState(false);

    return (
      <div
        className={cn(
          "flex-1 min-w-[300px] flex flex-col gap-4 p-3 -m-3 rounded-2xl transition-all duration-200",
          isDragOver && "bg-primary/5 ring-2 ring-primary ring-offset-2 ring-offset-background"
        )}
        onDragOver={(e) => {
          handleDragOver(e);
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          // Only set false if we're leaving the column container entirely
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX;
          const y = e.clientY;
          if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            setIsDragOver(false);
          }
        }}
        onDrop={(e) => {
          handleDrop(e, column.id);
          setIsDragOver(false);
        }}
        onDragEnd={() => setIsDragOver(false)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", column.color)} />
            <h3 className="font-semibold text-foreground">{column.title}</h3>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{columnTasks.length}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              setTaskForm({ ...taskForm, status: column.id });
              setOpen(true);
            }}
          >
            <PlusCircle className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>

        <div className="space-y-3 min-h-[100px]">
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
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDrop={handleTaskDrop}
                isDragging={draggingTaskId === task.id}
              />
            );
          })}
          {columnTasks.length === 0 && (
            <div
              className={cn(
                "h-24 border-2 border-dashed rounded-xl flex items-center justify-center text-muted-foreground text-sm transition-colors",
                isDragOver && "border-primary bg-primary/10 text-primary"
              )}
            >
              {isDragOver ? "Drop here" : "No tasks"}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <AppLayout breadcrumbs={[{ label: 'Tasks', path: '/tasks' }]}>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <PlusCircle className="h-4 w-4" />
              New Task
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Task</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Task Name</Label>
                  <Input
                    placeholder="Enter Task Name"
                    value={taskForm.title}
                    onChange={e => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Project Name</Label>
                  <Select value={taskForm.projectId} onValueChange={val => setTaskForm(prev => ({ ...prev, projectId: val }))}>
                    <SelectTrigger>
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
                    <SelectTrigger>
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
                    <SelectTrigger>
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
                        "w-full justify-start text-left font-normal",
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
                  className="min-h-[100px]"
                  value={taskForm.description}
                  onChange={e => setTaskForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)} variant="outline" className="mr-2">Cancel</Button>
              <Button onClick={handleCreate}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between gap-2 mb-8 overflow-x-auto pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground mr-2">Filters:</span>

          <Button
            variant={filters.assignedToMe ? "default" : "outline"}
            size="sm"
            className="rounded-full"
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
                className="rounded-full"
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
                    className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
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
                className="rounded-full"
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
                    className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
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
                className="rounded-full"
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
                className="rounded-full"
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
                    className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
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
          className="gap-2 shrink-0"
          onClick={openColumnsDialog}
        >
          <Settings2 className="w-4 h-4" />
          Customize Columns
        </Button>
      </div>

      {/* Edit Task Dialog */}
      <Dialog open={!!editingTask} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Task Name</Label>
                <Input
                  placeholder="Enter Task Name"
                  value={taskForm.title}
                  onChange={e => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Project Name</Label>
                <Select value={taskForm.projectId} onValueChange={val => setTaskForm(prev => ({ ...prev, projectId: val }))}>
                  <SelectTrigger>
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
                  <SelectTrigger>
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
                  <SelectTrigger>
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
                      "w-full justify-start text-left font-normal",
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
                className="min-h-[100px]"
                value={taskForm.description}
                onChange={e => setTaskForm(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              className="mr-auto"
              onClick={() => {
                if (editingTask) {
                  setTaskToDelete(editingTask);
                }
              }}
            >
              Delete
            </Button>
            <Button onClick={closeEditDialog} variant="outline" className="mr-2">Cancel</Button>
            <Button onClick={handleUpdate}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customize Columns Dialog */}
      <Dialog open={columnsDialogOpen} onOpenChange={setColumnsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Customize Columns</DialogTitle>
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
            <Button variant="outline" className="w-full gap-2" onClick={addColumn}>
              <Plus className="w-4 h-4" />
              Add Column
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setColumnsDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveColumns}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kanban Board */}
      <div className="flex gap-6 overflow-x-auto p-4 pb-8 flex-1" style={{ minHeight: 'calc(100vh - 280px)' }}>
        {columns.map(column => (
          <StatusColumn key={column.id} column={column} />
        ))}
      </div>
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
