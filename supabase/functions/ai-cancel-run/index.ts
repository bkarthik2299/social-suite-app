import { getUserClient, jsonResponse, readJson, requireMethod } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const methodResponse = requireMethod(req);
  if (methodResponse) return methodResponse;

  try {
    const supabase = getUserClient(req);
    const { runId } = await readJson<{ runId: string }>(req);
    if (!runId) return jsonResponse({ error: 'runId is required' }, 400);

    const { data, error } = await supabase
      .from('ai_runs')
      .update({ status: 'canceled' })
      .eq('id', runId)
      .select()
      .single();
    if (error) throw error;

    return jsonResponse({ run: data });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
