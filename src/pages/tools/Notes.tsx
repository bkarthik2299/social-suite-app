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

    const handleDeleteNote = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await deleteNote.mutateAsync(id);
        if (activeNoteId === id) {
            setActiveNoteId(null);
        }
    };

    return (
        <AppLayout breadcrumbs={[{ label: 'Tools', path: '#' }, { label: 'Notes', path: '/tools/notes' }]} noPadding={true}>
            <div className="flex h-[calc(100vh-4rem)] bg-background overflow-hidden">
                {/* Left Sidebar - List of Notes */}
                <div className="w-80 border-r bg-muted/20 flex flex-col">
                    <div className="p-4 border-b space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-500" />
                                Notes
                            </h2>
                            <Button size="icon" variant="ghost" onClick={handleCreateNote}>
                                <Plus className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search notes..."
                                className="pl-8 bg-background"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Select value={projectFilter} onValueChange={setProjectFilter}>
                            <SelectTrigger className="bg-background">
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
                        <div className="p-2 space-y-1">
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
                                            "p-3 rounded-md cursor-pointer transition-colors group flex items-start justify-between",
                                            activeNoteId === note.id ? "bg-indigo-50 dark:bg-indigo-500/10" : "hover:bg-muted"
                                        )}
                                    >
                                        <div className="overflow-hidden">
                                            <p className={cn(
                                                "font-medium truncate text-sm",
                                                activeNoteId === note.id ? "text-indigo-700 dark:text-indigo-300" : "text-foreground"
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
                                            className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                                            onClick={(e) => handleDeleteNote(note.id, e)}
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
                <div className="flex-1 flex flex-col bg-background min-w-0">
                    {activeNote ? (
                        <NoteEditor
                            key={activeNote.id}
                            note={activeNote}
                            projects={projects}
                            onUpdate={(id, updates) => updateNote.mutate({ id, updates })}
                        />
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                            Select a note or create a new one
                        </div>
                    )}
                </div>
            </div>
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
        <div className="flex flex-col h-full overflow-hidden p-8 max-w-4xl mx-auto w-full">
            <div className="mb-8 space-y-4">
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Untitled Note"
                    className="w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/50 focus:ring-0 p-0"
                />
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Project:</span>
                    <Select value={projectId} onValueChange={handleProjectChange}>
                        <SelectTrigger className="w-[200px] h-8 text-xs bg-transparent border-dashed">
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
            <div className="flex-1 overflow-y-auto -mx-12 px-12 pb-24 cursor-text blocknote-wrapper">
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
