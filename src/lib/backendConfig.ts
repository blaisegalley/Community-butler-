/**
 * Whether a hosted backend is configured.
 *
 * Deliberately its own module with no imports: `store.ts` needs this
 * answer on every page, but only the pages that actually touch data should
 * pay for downloading the Supabase client. Reading the flag from here
 * keeps that import dynamic.
 */
export function isBackendConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}
