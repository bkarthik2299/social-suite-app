import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

const fallbackSupabaseUrl = 'https://xeumxanbvsfbsctbyzfx.supabase.co';
const fallbackSupabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhldW14YW5idnNmYnNjdGJ5emZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNDE3NTcsImV4cCI6MjA5MTgxNzc1N30.U5cWYoStwoxTMKh1ek3yTl3iSfyhDwqA2shtf3jGEgQ';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackSupabaseUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackSupabaseAnonKey;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
