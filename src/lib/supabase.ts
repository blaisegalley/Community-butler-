import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isBackendConfigured } from '@/lib/backendConfig';

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export { isBackendConfigured };

let client: SupabaseClient | null = null;

/**
 * The anon key is meant to be public — it identifies the project, it does
 * not authorise anything. Every table's Row Level Security policy is what
 * decides what a request may read or write. See supabase/schema.sql.
 */
export function supabase(): SupabaseClient {
  if (!client) {
    if (!isBackendConfigured()) {
      throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
    }
    client = createClient(URL as string, ANON_KEY as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

/** The base URL for Edge Functions, derived from the project URL. */
export function functionsUrl(name: string): string {
  return `${String(URL).replace(/\/$/, '')}/functions/v1/${name}`;
}

export function anonKey(): string {
  return String(ANON_KEY);
}
