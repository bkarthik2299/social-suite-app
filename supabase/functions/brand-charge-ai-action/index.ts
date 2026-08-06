import { createClient } from 'npm:@supabase/supabase-js@2';

type BrandAiAction = 'brand_research' | 'brand_knowledge' | 'visual_analysis';

type RequestBody = {
  guideId: string;
  action: BrandAiAction;
};

const actionLabels: Record<BrandAiAction, string> = {
  brand_research: 'research the website',
  brand_knowledge: 'generate Brand Knowledge',
  visual_analysis: 'analyse images',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const getSupabasePublishableKey = () => {
  const legacyAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacyAnonKey) return legacyAnonKey;

  const publishableKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (publishableKeys) {
    try {
      const parsed = JSON.parse(publishableKeys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      throw new Error('SUPABASE_PUBLISHABLE_KEYS is not valid JSON');
    }
  }

  throw new Error('Supabase publishable key is not configured');
};

const getUserClient = (req: Request) => createClient(
  Deno.env.get('SUPABASE_URL')!,
  getSupabasePublishableKey(),
  {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

const getServiceClient = () => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  return createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: `Method ${req.method} not allowed` }, 405);

  try {
    const userClient = getUserClient(req);
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: 'Authentication required.' }, 401);

    const { guideId, action } = await req.json() as RequestBody;
    if (!guideId) return jsonResponse({ error: 'guideId is required.' }, 400);
    if (!action || !(action in actionLabels)) return jsonResponse({ error: 'A valid brand AI action is required.' }, 400);

    const { data: guide, error: guideError } = await userClient
      .from('brand_guides')
      .select('id,org_id')
      .eq('id', guideId)
      .maybeSingle();
    if (guideError) throw guideError;
    if (!guide?.org_id) return jsonResponse({ error: 'Brand guide not found or access denied.' }, 403);

    const { error, data } = await getServiceClient().rpc('charge_brand_ai_action_credit', {
      p_org_id: guide.org_id,
      p_action: action,
      p_action_key: `brand-action:${action}:${guideId}:${crypto.randomUUID()}`,
    });

    if (error) {
      const insufficientCredits = error.code === 'P0001'
        || /not enough ai credits/i.test(error.message || '');
      return jsonResponse({
        error: insufficientCredits
          ? `No AI credits remaining. You need 1 credit to ${actionLabels[action]}.`
          : 'The AI action completed, but its credit could not be recorded. Please try again.',
      }, insufficientCredits ? 402 : 500);
    }

    return jsonResponse({ balanceAfter: data, charged: 1 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
