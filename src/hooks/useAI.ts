import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { AiArtifact, AiRun, AiRunEvent, AiRunStep, BrandKnowledgeDocument } from '@/types/ai';

const db = supabase as unknown as SupabaseClient;

const isMissingTableError = (error: unknown) => {
  const code = (error as { code?: string })?.code;
  const message = String((error as { message?: string })?.message || '');
  return code === '42P01' || message.includes('does not exist') || message.includes('schema cache');
};

const invokeOrThrow = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  const payload = data as T & { error?: string };
  if (payload && typeof payload === 'object' && payload.error) {
    throw new Error(payload.error);
  }
  return payload;
};

export function useBrandKnowledge(guideId: string) {
  const qc = useQueryClient();
  const { organization } = useAuth();
  const orgId = organization?.id || '';

  const documentQuery = useQuery({
    queryKey: ['brand_knowledge_document', orgId, guideId],
    queryFn: async () => {
      const { data, error } = await db
        .from('brand_knowledge_documents')
        .select('*')
        .eq('guide_id', guideId)
        .maybeSingle();
      if (error) {
        if (isMissingTableError(error)) return null;
        throw error;
      }
      return data as BrandKnowledgeDocument | null;
    },
    enabled: !!orgId && !!guideId,
  });

  const compileKnowledge = useMutation({
    mutationFn: async () => invokeOrThrow<{ document: BrandKnowledgeDocument }>('brand-compile-knowledge', { guideId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brand_knowledge_document', orgId, guideId] }),
  });

  const updateMarkdown = useMutation({
    mutationFn: async ({ documentId, markdown }: { documentId: string; markdown: string }) => {
      const { data, error } = await db
        .from('brand_knowledge_documents')
        .update({ markdown, manual_edit: true, status: 'ready' })
        .eq('id', documentId)
        .select()
        .single();
      if (error) throw error;
      return data as BrandKnowledgeDocument;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brand_knowledge_document', orgId, guideId] }),
  });

  return {
    ...documentQuery,
    document: documentQuery.data ?? null,
    compileKnowledge,
    updateMarkdown,
  };
}

export function useAIMission() {
  const qc = useQueryClient();
  const { organization } = useAuth();
  const orgId = organization?.id || '';

  const startRun = useMutation({
    mutationFn: async (body: {
      prompt: string;
      projectId?: string | null;
      folderId?: string | null;
      campaignId?: string | null;
      brandGuideId?: string | null;
      brandKnowledgeDocumentId?: string | null;
      context?: Record<string, unknown>;
    }) => invokeOrThrow<{ run: AiRun; artifact?: AiArtifact | null }>('ai-start-run', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_runs', orgId] }),
  });

  const commitRun = useMutation({
    mutationFn: async ({ runId, artifactId }: { runId: string; artifactId?: string }) =>
      invokeOrThrow<{ inserted: { contentCount: number; calendarCount: number; campaignIds: Record<string, string> } }>('ai-commit-run', { runId, artifactId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_runs', orgId] }),
  });

  const cancelRun = useMutation({
    mutationFn: async (runId: string) => invokeOrThrow<{ run: AiRun }>('ai-cancel-run', { runId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_runs', orgId] }),
  });

  return { startRun, commitRun, cancelRun };
}

export function useAiRunDetails(runId: string | null) {
  const runQuery = useQuery({
    queryKey: ['ai_run', runId],
    queryFn: async () => {
      const { data, error } = await db.from('ai_runs').select('*').eq('id', runId).single();
      if (error) throw error;
      return data as AiRun;
    },
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = (query.state.data as AiRun | undefined)?.status;
      return status === 'running' || status === 'queued' ? 1200 : false;
    },
  });

  const isLiveRun = runQuery.data?.status === 'running' || runQuery.data?.status === 'queued';

  const stepsQuery = useQuery({
    queryKey: ['ai_run_steps', runId],
    queryFn: async () => {
      const { data, error } = await db.from('ai_run_steps').select('*').eq('run_id', runId).order('sort_order');
      if (error) throw error;
      return data as AiRunStep[];
    },
    enabled: !!runId,
    refetchInterval: isLiveRun ? 1200 : false,
  });

  const eventsQuery = useQuery({
    queryKey: ['ai_run_events', runId],
    queryFn: async () => {
      const { data, error } = await db.from('ai_run_events').select('*').eq('run_id', runId).order('created_at');
      if (error) throw error;
      return data as AiRunEvent[];
    },
    enabled: !!runId,
    refetchInterval: isLiveRun ? 1200 : false,
  });

  const artifactsQuery = useQuery({
    queryKey: ['ai_artifacts', runId],
    queryFn: async () => {
      const { data, error } = await db.from('ai_artifacts').select('*').eq('run_id', runId).order('created_at', { ascending: false });
      if (error) throw error;
      return data as AiArtifact[];
    },
    enabled: !!runId,
    refetchInterval: isLiveRun ? 1200 : false,
  });

  return {
    run: runQuery.data ?? null,
    steps: stepsQuery.data ?? [],
    events: eventsQuery.data ?? [],
    artifacts: artifactsQuery.data ?? [],
    isLoading: runQuery.isLoading || stepsQuery.isLoading || eventsQuery.isLoading || artifactsQuery.isLoading,
    error: runQuery.error || stepsQuery.error || eventsQuery.error || artifactsQuery.error,
  };
}
