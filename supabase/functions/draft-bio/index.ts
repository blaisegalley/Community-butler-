/*
 * Drafts a butler's bio from their questionnaire answers.
 *
 * Called by the butler themselves, right after they submit their intake
 * form. It writes a draft and leaves the profile Pending — it cannot
 * publish anything, and a manager reads every one.
 */
import { json, preflight } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { draftBio, type Intake } from '../_shared/bio.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in first.' }, 401);

  const db = serviceClient();
  const { data: user, error: userError } = await db.auth.getUser(token);
  if (userError || !user.user) return json({ error: 'Sign in first.' }, 401);

  // The butler is found from the token, never from the request body — so
  // nobody can draft a bio onto somebody else's profile.
  const { data: butler, error } = await db
    .from('butlers')
    .select('id,name,intake,profile_status')
    .eq('user_id', user.user.id)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!butler) return json({ error: 'No Butler profile for this account.' }, 404);

  const { bio, source } = await draftBio(butler.name, (butler.intake ?? {}) as Intake);

  const { error: writeError } = await db
    .from('butlers')
    .update({ bio, profile_status: 'Pending' })
    .eq('id', butler.id);
  if (writeError) return json({ error: writeError.message }, 500);

  return json({ ok: true, bio, source });
});
