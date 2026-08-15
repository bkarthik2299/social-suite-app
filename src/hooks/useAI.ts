import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { AiAgent, AiArtifact, AiCreditAccount, AiDraftSelection, AiRun, AiRunEvent, AiRunStep, AiWorkflowStep, BrandKnowledgeDocument } from '@/types/ai';
import { cancelAiMission, commitAiMission, startAiMission, type CommitAiMissionResult } from '@/services/aiMissions';
import { compileBrandKnowledge, researchBrandWebsite } from '@/services/brandGuides';
import { invokeFunction } from '@/services/edgeFunctions';

const db = supabase as unknown as SupabaseClient;
export const defaultAiAgentFlow = ['planner', 'brand-guide', 'research', 'creative-strategist', 'copywriter', 'platform-specialist', 'qa', 'output-mapper'];
export const optionalAiAgentFlow = ['humanizer'];
const AI_RUN_POLL_MS = 1800;
const AI_RUN_STALE_MS = 4 * 60 * 1000;

export type AiCommitRunResult = CommitAiMissionResult;

const isMissingTableError = (error: unknown) => {
  const code = (error as { code?: string })?.code;
  const message = String((error as { message?: string })?.message || '');
  return code === '42P01' || message.includes('does not exist') || message.includes('schema cache');
};

type BrandAiAction = 'brand_research' | 'brand_knowledge' | 'visual_analysis';

const chargeBrandAiAction = async (guideId: string, action: BrandAiAction) =>
  invokeFunction<{ balanceAfter: number; charged: number }>('brand-charge-ai-action', { guideId, action });

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
    mutationFn: async () => {
      return compileBrandKnowledge({ guideId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brand_knowledge_document', orgId, guideId] });
      qc.invalidateQueries({ queryKey: ['ai_credit_account', orgId] });
    },
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

export function useBrandResearch(guideId: string) {
  const qc = useQueryClient();
  const { organization } = useAuth();
  const orgId = organization?.id || '';

  return useMutation({
    mutationFn: async ({ brandName, websiteUrl }: { brandName: string; websiteUrl: string }) => {
      return researchBrandWebsite({ guideId, brandName, websiteUrl });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['brand_guides', orgId] });
      void qc.invalidateQueries({ queryKey: ['brand_guide', orgId, guideId] });
      void qc.invalidateQueries({ queryKey: ['brand_colors', guideId] });
      void qc.invalidateQueries({ queryKey: ['brand_fonts', guideId] });
      void qc.invalidateQueries({ queryKey: ['brand_logos', guideId] });
      void qc.invalidateQueries({ queryKey: ['brand_knowledge_document', orgId, guideId] });
      void qc.invalidateQueries({ queryKey: ['ai_credit_account', orgId] });
    },
  });
}

export type VisualDirectionAnalysis = {
  fields: {
    photography_style: string;
    illustration_style: string;
    iconography_rules: string;
    layout_composition: string;
  };
  pattern_notes: {
    consistent_patterns: string[];
    recurring_patterns: string[];
    one_off_treatments: string[];
  };
};

export function useBrandVisualDirectionAnalysis(guideId: string) {
  const qc = useQueryClient();
  const { organization } = useAuth();
  const orgId = organization?.id || '';

  return useMutation({
    mutationFn: async () => {
      const result = await invokeFunction<{
        analysis: VisualDirectionAnalysis;
        imageCount: number;
        model: string;
      }>('brand-analyze-visual-direction', { guideId });
      await chargeBrandAiAction(guideId, 'visual_analysis');
      return result;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai_credit_account', orgId] });
    },
  });
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
    }) => startAiMission(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai_runs', orgId] });
    },
  });

  const commitRun = useMutation({
    mutationFn: async ({ runId, artifactId, selection }: { runId: string; artifactId?: string; selection?: AiDraftSelection }) =>
      commitAiMission({ runId, artifactId, selection }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['ai_runs', orgId] }),
        qc.invalidateQueries({ queryKey: ['all_folders'] }),
        qc.invalidateQueries({ queryKey: ['folders'] }),
        qc.invalidateQueries({ queryKey: ['all_campaigns'] }),
        qc.invalidateQueries({ queryKey: ['campaigns'] }),
        qc.invalidateQueries({ queryKey: ['content_items'] }),
        qc.invalidateQueries({ queryKey: ['calendar_events'] }),
      ]);
    },
  });

  const cancelRun = useMutation({
    mutationFn: async (runId: string) => cancelAiMission(runId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai_runs', orgId] });
    },
  });

  return { startRun, commitRun, cancelRun };
}

export function useAiRuns(limit = 5) {
  const { organization } = useAuth();
  const orgId = organization?.id || '';

  return useQuery({
    queryKey: ['ai_runs', orgId, limit],
    queryFn: async () => {
      const { data, error } = await db
        .from('ai_runs')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }
      return data as AiRun[];
    },
    enabled: !!orgId,
  });
}

export function useAiCredits({ live = false }: { live?: boolean } = {}) {
  const qc = useQueryClient();
  const { organization } = useAuth();
  const orgId = organization?.id || '';
  const queryKey = ['ai_credit_account', orgId] as const;

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await db
        .from('ai_credit_accounts')
        .select('*')
        .eq('org_id', orgId)
        .maybeSingle();
      if (error) {
        if (isMissingTableError(error)) return null;
        throw error;
      }
      return data as AiCreditAccount | null;
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!live || !orgId) return;

    const channel = supabase
      .channel(`ai-credit-account:${orgId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ai_credit_accounts',
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const account = payload.new as AiCreditAccount;
          if (account.org_id === orgId) qc.setQueryData(['ai_credit_account', orgId], account);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [live, orgId, qc]);

  return query;
}

export function useDeleteAiRun() {
  const qc = useQueryClient();
  const { organization } = useAuth();
  const orgId = organization?.id || '';

  return useMutation({
    mutationFn: async (runId: string) => {
      const { error } = await db
        .from('ai_runs')
        .delete()
        .eq('id', runId)
        .eq('org_id', orgId);
      if (error) throw error;
      return runId;
    },
    onSuccess: (runId) => {
      void qc.invalidateQueries({ queryKey: ['ai_runs', orgId] });
      void qc.removeQueries({ queryKey: ['ai_run', runId] });
      void qc.removeQueries({ queryKey: ['ai_run_steps', runId] });
      void qc.removeQueries({ queryKey: ['ai_run_events', runId] });
      void qc.removeQueries({ queryKey: ['ai_artifacts', runId] });
    },
  });
}

export function useAiAgents() {
  const qc = useQueryClient();
  const { organization, user } = useAuth();
  const orgId = organization?.id || '';

  const query = useQuery({
    queryKey: ['ai_agents', orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from('ai_agents')
        .select('*')
        .or(`org_id.is.null,org_id.eq.${orgId}`)
        .eq('is_enabled', true)
        .order('name');
      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }

      const agents = new Map<string, AiAgent>();
      for (const agent of data as AiAgent[]) {
        if (!agent.org_id && agents.has(agent.slug)) continue;
        agents.set(agent.slug, agent);
      }
      return Array.from(agents.values()).sort((left, right) => left.name.localeCompare(right.name));
    },
    enabled: !!orgId,
  });

  const saveSkill = useMutation({
    mutationFn: async ({ agent, skillMd }: { agent: AiAgent; skillMd: string }) => {
      const cleanSkill = skillMd.trim();
      if (!cleanSkill) throw new Error('Skill markdown cannot be empty.');

      let savedAgent: AiAgent;
      if (agent.org_id === orgId) {
        const { data, error } = await db
          .from('ai_agents')
          .update({ skill_md: cleanSkill })
          .eq('id', agent.id)
          .select()
          .single();
        if (error) throw error;
        savedAgent = data as AiAgent;
      } else {
        const { data: existing, error: lookupError } = await db
          .from('ai_agents')
          .select('*')
          .eq('org_id', orgId)
          .eq('slug', agent.slug)
          .maybeSingle();
        if (lookupError) throw lookupError;

        if (existing) {
          const { data, error } = await db
            .from('ai_agents')
            .update({ skill_md: cleanSkill })
            .eq('id', existing.id)
            .select()
            .single();
          if (error) throw error;
          savedAgent = data as AiAgent;
        } else {
          const { data, error } = await db
            .from('ai_agents')
            .insert({
              org_id: orgId,
              slug: agent.slug,
              name: agent.name,
              description: agent.description,
              skill_md: cleanSkill,
              tools: agent.tools,
              output_schema: agent.output_schema,
              permissions: agent.permissions,
              is_default: false,
              is_enabled: true,
              created_by: user?.id || null,
            })
            .select()
            .single();
          if (error) throw error;
          savedAgent = data as AiAgent;
        }
      }

      await db.from('ai_agent_versions').insert({
        agent_id: savedAgent.id,
        skill_md: cleanSkill,
        change_note: 'Updated from Social Suite Customize Agent.',
        created_by: user?.id || null,
      });

      return savedAgent;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_agents', orgId] }),
  });

  const createAgent = useMutation({
    mutationFn: async ({ name, description, skillMd }: { name: string; description: string; skillMd: string }) => {
      const cleanName = name.trim();
      const cleanSkill = skillMd.trim();
      if (!cleanName) throw new Error('Agent name is required.');
      if (!cleanSkill) throw new Error('Skill markdown cannot be empty.');

      const slug = `${slugifyAgentName(cleanName)}-${crypto.randomUUID().slice(0, 6)}`;
      const { data, error } = await db
        .from('ai_agents')
        .insert({
          org_id: orgId,
          slug,
          name: cleanName,
          description: description.trim() || 'Workspace agent with a custom Social Suite skill.',
          skill_md: cleanSkill,
          tools: [],
          output_schema: 'workspace_skill',
          permissions: { can_write: false },
          is_default: false,
          is_enabled: true,
          created_by: user?.id || null,
        })
        .select()
        .single();
      if (error) throw error;

      const savedAgent = data as AiAgent;
      const { error: versionError } = await db.from('ai_agent_versions').insert({
        agent_id: savedAgent.id,
        skill_md: cleanSkill,
        change_note: 'Created from Social Suite Customize Agent.',
        created_by: user?.id || null,
      });
      if (versionError) throw versionError;
      return savedAgent;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_agents', orgId] }),
  });

  const deleteAgent = useMutation({
    mutationFn: async (agent: AiAgent) => {
      if (agent.org_id !== orgId || agent.is_default) throw new Error('Built-in agents cannot be deleted.');
      const { error: workflowError } = await db
        .from('ai_agent_workflow_steps')
        .delete()
        .eq('org_id', orgId)
        .eq('agent_slug', agent.slug);
      if (workflowError && !isMissingTableError(workflowError)) throw workflowError;

      const { error } = await db.from('ai_agents').delete().eq('id', agent.id).eq('org_id', orgId);
      if (error) throw error;
      return agent.slug;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai_agents', orgId] });
      void qc.invalidateQueries({ queryKey: ['ai_agent_workflow', orgId] });
    },
  });

  return { ...query, saveSkill, createAgent, deleteAgent };
}

export function useAiWorkflow() {
  const qc = useQueryClient();
  const { organization } = useAuth();
  const orgId = organization?.id || '';

  const query = useQuery({
    queryKey: ['ai_agent_workflow', orgId],
    queryFn: async () => {
      const { data, error } = await db
        .from('ai_agent_workflow_steps')
        .select('*')
        .eq('org_id', orgId)
        .order('sort_order');
      if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
      }
      return data as AiWorkflowStep[];
    },
    enabled: !!orgId,
  });

  const saveWorkflow = useMutation({
    mutationFn: async (agentSlugs: string[]) => {
      const uniqueSlugs = Array.from(new Set(agentSlugs.filter(Boolean)));
      if (!uniqueSlugs.length) throw new Error('The workflow needs at least one agent.');

      const { data, error } = await db.rpc('replace_ai_agent_workflow', {
        p_org_id: orgId,
        p_agent_slugs: uniqueSlugs,
      });
      if (error) throw error;
      return data as AiWorkflowStep[];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_agent_workflow', orgId] }),
  });

  return { ...query, saveWorkflow };
}

function slugifyAgentName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'custom-agent';
}

export function useAiRunDetails(runId: string | null) {
  const qc = useQueryClient();
  const recoveredRunRef = useRef<string | null>(null);
  const terminalRefreshRef = useRef<string | null>(null);
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
      return status === 'running' || status === 'queued' ? AI_RUN_POLL_MS : false;
    },
  });

  const isLiveRun = runQuery.data?.status === 'running' || runQuery.data?.status === 'queued';

  useEffect(() => {
    if (!runId || !runQuery.data || isLiveRun || terminalRefreshRef.current === runId) return;
    terminalRefreshRef.current = runId;
    void Promise.all([
      qc.invalidateQueries({ queryKey: ['ai_run_steps', runId] }),
      qc.invalidateQueries({ queryKey: ['ai_run_events', runId] }),
      qc.invalidateQueries({ queryKey: ['ai_artifacts', runId] }),
    ]);
  }, [isLiveRun, qc, runId, runQuery.data]);

  useEffect(() => {
    const run = runQuery.data;
    const startedAt = Date.parse(run?.created_at || '');
    if (!runId || !run || !isLiveRun || !Number.isFinite(startedAt)) return;
    if (Date.now() - startedAt < AI_RUN_STALE_MS || recoveredRunRef.current === runId) return;

    recoveredRunRef.current = runId;
    const message = 'The mission exceeded its safe processing window and was stopped. Please retry; no incomplete drafts were saved.';
    void (async () => {
      const [stepResult, runResult] = await Promise.all([
        db.from('ai_run_steps').update({
          status: 'failed',
          message,
          completed_at: new Date().toISOString(),
        }).eq('run_id', runId).eq('status', 'working'),
        db.from('ai_runs').update({
          status: 'failed',
          error: message,
          completed_at: new Date().toISOString(),
        }).eq('id', runId).in('status', ['queued', 'running']),
      ]);
      if (stepResult.error) throw stepResult.error;
      if (runResult.error) throw runResult.error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['ai_run', runId] }),
        qc.invalidateQueries({ queryKey: ['ai_run_steps', runId] }),
      ]);
    })().catch(() => {
      recoveredRunRef.current = null;
    });
  }, [isLiveRun, qc, runId, runQuery.data, runQuery.dataUpdatedAt]);

  const stepsQuery = useQuery({
    queryKey: ['ai_run_steps', runId],
    queryFn: async () => {
      const { data, error } = await db.from('ai_run_steps').select('*').eq('run_id', runId).order('sort_order');
      if (error) throw error;
      return data as AiRunStep[];
    },
    enabled: !!runId,
    refetchInterval: isLiveRun ? AI_RUN_POLL_MS : false,
  });

  const eventsQuery = useQuery({
    queryKey: ['ai_run_events', runId],
    queryFn: async () => {
      const { data, error } = await db.from('ai_run_events').select('*').eq('run_id', runId).order('created_at');
      if (error) throw error;
      return data as AiRunEvent[];
    },
    enabled: !!runId,
    refetchInterval: isLiveRun ? AI_RUN_POLL_MS : false,
  });

  const artifactsQuery = useQuery({
    queryKey: ['ai_artifacts', runId],
    queryFn: async () => {
      const { data, error } = await db.from('ai_artifacts').select('*').eq('run_id', runId).order('created_at', { ascending: false });
      if (error) throw error;
      return data as AiArtifact[];
    },
    enabled: !!runId,
    refetchInterval: isLiveRun ? AI_RUN_POLL_MS : false,
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
