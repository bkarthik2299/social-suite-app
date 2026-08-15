import type { AiArtifact, AiDraftSelection, AiRun } from '@/types/ai';
import { invokeFunction } from '@/services/edgeFunctions';

export type StartAiMissionInput = {
  prompt: string;
  projectId?: string | null;
  folderId?: string | null;
  campaignId?: string | null;
  brandGuideId?: string | null;
  brandKnowledgeDocumentId?: string | null;
  context?: Record<string, unknown>;
};

export type CommitAiMissionResult = {
  inserted: {
    contentCount: number;
    calendarCount: number;
    campaignIds: Record<string, string>;
    destination?: { projectId: string | null; folderId: string | null; folderName: string | null };
  };
};

export const startAiMission = (input: StartAiMissionInput) =>
  invokeFunction<{ run: AiRun; artifact?: AiArtifact | null }>('ai-start-run', input);

export const commitAiMission = ({ runId, artifactId, selection }: {
  runId: string;
  artifactId?: string;
  selection?: AiDraftSelection;
}) => invokeFunction<CommitAiMissionResult>('ai-commit-run', { runId, artifactId, selection });

export const cancelAiMission = (runId: string) =>
  invokeFunction<{ run: AiRun }>('ai-cancel-run', { runId });
