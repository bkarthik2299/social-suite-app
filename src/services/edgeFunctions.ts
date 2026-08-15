import { supabase } from '@/lib/supabase';

export async function edgeFunctionErrorMessage(error: unknown) {
  const fallback = String((error as { message?: string })?.message || 'Edge Function failed');
  const context = (error as { context?: unknown })?.context;
  if (!context || typeof context !== 'object') return fallback;

  const response = context as Response;
  try {
    const payload = await response.clone().json() as { error?: string; message?: string };
    return payload.error || payload.message || fallback;
  } catch {
    try {
      return (await response.clone().text()).slice(0, 500) || fallback;
    } catch {
      return fallback;
    }
  }
}

export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(await edgeFunctionErrorMessage(error));
  const payload = data as T & { error?: string };
  if (payload && typeof payload === 'object' && payload.error) throw new Error(payload.error);
  return payload;
}
