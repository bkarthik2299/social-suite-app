import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

const requireEnv = (key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY') => {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(`${key} is required. Add it in Vercel project env vars and local .env.local.`);
  }
  return value;
};

const supabaseUrl = requireEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = requireEnv('VITE_SUPABASE_ANON_KEY');

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
