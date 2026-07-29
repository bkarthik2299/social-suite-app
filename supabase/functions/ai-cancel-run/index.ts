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
      .update({ status: 'canceled', error: null })
      .eq('id', runId)
      .in('status', ['queued', 'running'])
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonResponse({ error: 'Run is no longer active' }, 409);

    await supabase.from('ai_run_events').insert({
      run_id: runId,
      step_id: null,
      event_type: 'cancel_requested',
      message: 'Cancellation requested by the user.',
      payload: {},
    });

    return jsonResponse({ run: data });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
