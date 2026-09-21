import { createClient, type SupabaseClient } from './deps.ts';

/**
 * A client with the service role key. It bypasses Row Level Security, so
 * it must never be handed anything derived from a request body without a
 * check first. Every caller below authenticates the requester before
 * using it.
 */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

/**
 * Confirms the bearer token on this request belongs to an admin.
 *
 * Verifying the JWT is not enough on its own: any signed-up butler holds
 * a valid one. Approving jobs and emailing neighbours is admin work, so
 * the token has to map to a row in `admins`.
 */
export async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return new Response('Missing authorization', { status: 401 });

  const db = serviceClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return new Response('Not signed in', { status: 401 });

  const { data: admin } = await db
    .from('admins')
    .select('id')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (!admin) return new Response('Admins only', { status: 403 });

  return { userId: data.user.id };
}

/**
 * Guards the scheduled endpoints, which have no user behind them. The
 * secret is sent by the cron job defined in schema.sql.
 */
export function requireCronSecret(req: Request): Response | null {
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected) return new Response('CRON_SECRET is not set', { status: 500 });
  if (req.headers.get('x-cron-secret') !== expected) {
    return new Response('Forbidden', { status: 403 });
  }
  return null;
}
