/*
 * Adds another admin.
 *
 * Creating a user account requires the service role key, and that key
 * cannot go anywhere near a browser — anyone holding it can read every
 * neighbour's address. So the dashboard asks this function instead, and
 * this function checks the requester is already an admin before doing
 * anything at all.
 */
import { json, preflight } from '../_shared/http.ts';
import { requireAdmin, serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  let email: string;
  let password: string;
  try {
    ({ email, password } = await req.json());
  } catch {
    return json({ error: 'Expected { email, password }' }, 400);
  }
  if (!email || !password) return json({ error: 'Expected { email, password }' }, 400);
  if (password.length < 8) return json({ error: 'Use a password of at least 8 characters.' }, 400);

  const db = serviceClient();

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
  });
  if (createError) return json({ error: createError.message }, 400);

  const { error: rowError } = await db
    .from('admins')
    .insert({ user_id: created.user.id, email: email.trim() });
  if (rowError) {
    // Leaving a user account behind that grants nothing would be
    // confusing: they could sign in and be told they are not an admin.
    await db.auth.admin.deleteUser(created.user.id);
    return json({ error: rowError.message }, 500);
  }

  return json({ ok: true });
});
