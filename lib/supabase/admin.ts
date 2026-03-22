import { createClient } from '@supabase/supabase-js';
import { DB_SCHEMA } from '@/lib/db';
import { env } from '@/lib/env';

export function getAdminSupabase() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    db: {
      schema: DB_SCHEMA
    }
  });
}
