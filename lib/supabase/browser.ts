'use client';

import { createClient } from '@supabase/supabase-js';
import { DB_SCHEMA } from '@/lib/db';

let browserClient: ReturnType<typeof createClient> | null = null;

export function getBrowserSupabase() {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      throw new Error('Supabase public environment variables are missing.');
    }

    browserClient = createClient(url, anonKey, {
      db: {
        schema: DB_SCHEMA
      }
    } as unknown as Parameters<typeof createClient>[2]);
  }

  return browserClient;
}
