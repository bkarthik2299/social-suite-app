import { currentUserId, getUserClient, jsonResponse, readJson, requireMethod } from '../_shared/http.ts';

type DraftSelection = {
  socialPosts?: number[];
  googleAds?: number[];
  socialAds?: number[];
  blogOutlines?: number[];
  calendar?: number[];
};

type RequestBody = {
  runId: string;
  artifactId?: string;
  selection?: DraftSelection;
};

Deno.serve(async (req) => {
  const methodResponse = requireMethod(req);
  if (methodResponse) return methodResponse;

  try {
    const supabase = getUserClient(req);
    await currentUserId(supabase);
    const { runId, artifactId, selection } = await readJson<RequestBody>(req);
    if (!runId) return jsonResponse({ error: 'runId is required' }, 400);

    const { data, error } = await supabase.rpc('commit_ai_campaign_drafts', {
      p_run_id: runId,
      p_artifact_id: artifactId || null,
      p_selection: selection || null,
    });
    if (error) {
      const conflict = /not waiting for approval|already completed/i.test(error.message || '');
      return jsonResponse({ error: error.message || 'Could not create drafts' }, conflict ? 409 : 400);
    }

    return jsonResponse(data);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
