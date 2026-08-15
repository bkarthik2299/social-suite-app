import { supabase } from '@/lib/supabase';
import type { Folder, Project } from '@/types';

export async function createProject({ name, orgId }: { name: string; orgId: string }): Promise<Project> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Project name is required');

  const { data, error } = await supabase
    .from('projects')
    .insert({ name: cleanName, org_id: orgId })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name, createdAt: data.created_at || '' };
}

export async function createFolder({ projectId, name }: { projectId: string; name: string }): Promise<Folder> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Folder name is required');

  const { data, error } = await supabase
    .from('folders')
    .insert({ name: cleanName, project_id: projectId })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, projectId: data.project_id, name: data.name, createdAt: data.created_at || '' };
}

export async function updateProject({ id, updates }: { id: string; updates: { name?: string } }) {
  const { error } = await supabase.from('projects').update(updates).eq('id', id);
  if (error) throw error;
}

export async function updateFolder({ id, updates }: { id: string; updates: { name?: string } }) {
  const { error } = await supabase.from('folders').update(updates).eq('id', id);
  if (error) throw error;
}
