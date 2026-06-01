import { createClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

export const requireMethod = (req: Request, method = 'POST') => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== method) {
    return jsonResponse({ error: `Method ${req.method} not allowed` }, 405);
  }
  return null;
};

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

export const getUserClient = (req: Request) => {
  const authHeader = req.headers.get('Authorization') || '';
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    getSupabasePublishableKey(),
    {
      global: {
        headers: { Authorization: authHeader },
      },
    },
  );
};

export const getRequiredSecret = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export const readJson = async <T>(req: Request): Promise<T> => {
  try {
    return await req.json();
  } catch {
    throw new Error('Invalid JSON request body');
  }
};

export const currentUserId = async (supabase: ReturnType<typeof getUserClient>) => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Authentication required');
  return data.user.id;
};
