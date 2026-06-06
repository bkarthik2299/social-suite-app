import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useNotes, useProjects } from '@/hooks/useDatabase';
import { Note, Project } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Trash2, FileText } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// BlockNote imports
import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";

export default function Notes() {
    const { organization } = useAuth();
    const orgId = organization?.id ?? '';
    const { data: notes = [], addNote, updateNote, deleteNote } = useNotes();
    const { data: projects = [] } = useProjects();

    const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [projectFilter, setProjectFilter] = useState<string>('all');
    const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
    
    const activeNote = notes.find(n => n.id === activeNoteId);

    // Filter notes based on search and project
    const filteredNotes = useMemo(() => {
        return notes.filter(note => {
            const matchesSearch = (note.title || 'Untitled Note').toLowerCase().includes(searchQuery.toLowerCase());
            const matchesProject = projectFilter === 'all' || note.projectId === projectFilter;
            return matchesSearch && matchesProject;
        });
    }, [notes, searchQuery, projectFilter]);

    // Handle initial note selection
    useEffect(() => {
        if (!activeNoteId && filteredNotes.length > 0) {
            setActiveNoteId(filteredNotes[0].id);
        }
    }, [filteredNotes, activeNoteId]);

    const handleCreateNote = async () => {
        const newNote = await addNote.mutateAsync({
            title: 'Untitled Note',
            content: [],
            project_id: projectFilter !== 'all' ? projectFilter : undefined
        });
        if (newNote) {
            setActiveNoteId(newNote.id);
        }
    };

    const handleDeleteNote = (note: Note, e: React.MouseEvent) => {
        e.stopPropagation();
        setNoteToDelete(note);
    };

    const confirmDeleteNote = async () => {
        if (!noteToDelete) return;
        await deleteNote.mutateAsync(noteToDelete.id);
        if (activeNoteId === noteToDelete.id) {
            setActiveNoteId(null);
        }
        setNoteToDelete(null);
    };

    return (
        <AppLayout breadcrumbs={[{ label: 'Tools', path: '#' }, { label: 'Notes', path: '/tools/notes' }]} noPadding={true}>
            <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-slate-50">
                {/* Left Sidebar - List of Notes */}
                <div className="flex w-80 flex-col bg-white shadow-[8px_0_28px_-30px_rgba(37,99,235,0.45),1px_0_3px_rgba(15,23,42,0.04)]">
                    <div className="space-y-4 p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <FileText className="h-4 w-4" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-950">Notes</h2>
                                    <p className="text-xs text-slate-500">Ideas and drafts</p>
                                </div>
                            </div>
                            <Button size="icon" variant="ghost" className="rounded-full text-slate-500 hover:bg-blue-50 hover:text-primary" onClick={handleCreateNote}>
                                <Plus className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search notes..."
                                className="tool-surface h-10 rounded-xl pl-8"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Select value={projectFilter} onValueChange={setProjectFilter}>
                            <SelectTrigger className="tool-surface h-10 rounded-xl">
                                <SelectValue placeholder="Filter by Project" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Projects</SelectItem>
                                {projects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="space-y-1 p-2">
                            {filteredNotes.length === 0 ? (
                                <div className="text-center p-4 text-sm text-muted-foreground">
                                    No notes found.
                                </div>
                            ) : (
                                filteredNotes.map(note => (
                                    <div
                                        key={note.id}
                                        onClick={() => setActiveNoteId(note.id)}
                                        className={cn(
                                            "group flex cursor-pointer items-start justify-between rounded-lg p-3 transition-colors",
                                            activeNoteId === note.id ? "bg-blue-50 text-primary shadow-sm" : "text-slate-700 hover:bg-slate-50"
                                        )}
                                    >
                                        <div className="overflow-hidden">
                                            <p className={cn(
                                                "font-medium truncate text-sm",
                                                activeNoteId === note.id ? "text-primary" : "text-slate-900"
                                            )}>
                                                {note.title || 'Untitled Note'}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1 truncate">
                                                {new Date(note.updatedAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-6 w-6 text-slate-400 opacity-0 hover:bg-rose-50 hover:text-destructive group-hover:opacity-100"
                                            onClick={(e) => handleDeleteNote(note, e)}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </div>

                {/* Main Content - Editor */}
                <div className="flex min-w-0 flex-1 flex-col bg-slate-50">
                    {activeNote ? (
                        <NoteEditor
                            key={activeNote.id}
                            note={activeNote}
                            projects={projects}
                            onUpdate={(id, updates) => updateNote.mutate({ id, updates })}
                        />
                    ) : (
                        <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">
                            <div className="tool-surface flex max-w-sm flex-col items-center rounded-xl p-8 text-center">
                                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                    <FileText className="h-7 w-7" />
                                </div>
                                <p className="text-sm font-medium text-slate-700">Select a note or create a new one</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <AlertDialog open={!!noteToDelete} onOpenChange={(open) => !open && setNoteToDelete(null)}>
                <AlertDialogContent className="border-0 bg-white shadow-2xl sm:rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete note?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete "{noteToDelete?.title || 'Untitled Note'}". This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteNote.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => void confirmDeleteNote()}
                            disabled={deleteNote.isPending}
                            className="bg-red-600 text-white hover:bg-red-700"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}

// Separate component for the editor to manage local state and debouncing
function NoteEditor({ note, projects, onUpdate }: { note: Note, projects: Project[], onUpdate: (id: string, updates: Record<string, unknown>) => void }) {
    const [title, setTitle] = useState(note.title);
    const [projectId, setProjectId] = useState<string>(note.projectId || 'none');
    
    // We update the local title immediately so the input feels responsive,
    // but we debounce the actual API call.
    const debouncedTitle = useDebounce(title, 500);

    useEffect(() => {
        setTitle(note.title);
        setProjectId(note.projectId || 'none');
    }, [note.id]);

    useEffect(() => {
        if (debouncedTitle !== note.title) {
            onUpdate(note.id, { title: debouncedTitle });
        }
    }, [debouncedTitle]);

    const handleProjectChange = (val: string) => {
        setProjectId(val);
        onUpdate(note.id, { project_id: val === 'none' ? null : val });
    };

    // Initialize BlockNote
    const editor = useCreateBlockNote({
        initialContent: (note.content && note.content.length > 0) ? note.content : undefined,
    });

    const handleContentChange = () => {
        if (editor) {
            const blocks = editor.document;
            onUpdate(note.id, { content: blocks });
        }
    };

    // Key to force remount of editor if the active note completely changes
    return (
        <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden p-8">
            <div className="mb-6 space-y-4">
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Untitled Note"
                    className="w-full border-none bg-transparent p-0 text-3xl font-bold text-slate-950 outline-none placeholder:text-muted-foreground/50 focus:ring-0"
                />
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Project:</span>
                    <Select value={projectId} onValueChange={handleProjectChange}>
                        <SelectTrigger className="tool-surface h-9 w-[200px] rounded-xl text-xs">
                            <SelectValue placeholder="No Project" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">No Project</SelectItem>
                            {projects.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <div className="tool-surface blocknote-wrapper flex-1 cursor-text overflow-y-auto rounded-xl px-7 py-6">
                <BlockNoteView
                    editor={editor}
                    onChange={handleContentChange}
                    theme="light" // Ideally match system/app theme, keeping simple for now
                    className="h-full min-h-[500px]"
                />
            </div>
        </div>
    );
}
