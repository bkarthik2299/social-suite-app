import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xeumxanbvsfbsctbyzfx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhldW14YW5idnNmYnNjdGJ5emZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNDE3NTcsImV4cCI6MjA5MTgxNzc1N30.U5cWYoStwoxTMKh1ek3yTl3iSfyhDwqA2shtf3jGEgQ';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
    // We cannot query org_members for a specific user_id without their token,
    // because RLS restricts it. But let's see if we can query organizations.
    const { data, error } = await supabase.from('organizations').select('*');
    console.log("Orgs:", data, "Error:", error);
}

check();
