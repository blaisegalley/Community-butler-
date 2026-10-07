/*
 * Butler profiles: the intake questionnaire, the photo, and the review
 * queue that stands between them and the public roster.
 *
 * This is remote-only. Profiles need file storage and a server to draft
 * the bio, neither of which the localStorage fallback has — so every
 * call here fails loudly rather than pretending, and the UI checks
 * `isShared` before offering any of it.
 */

import { isBackendConfigured } from '@/lib/backendConfig';

export type ProfileStatus = 'Draft' | 'Pending' | 'Approved' | 'Rejected';

export interface ButlerIntake {
  grade: string;
  availability: string;
  experience: string;
  goodAt: string;
  why: string;
  prefs: string[];
}

export const EMPTY_INTAKE: ButlerIntake = {
  grade: '',
  availability: '',
  experience: '',
  goodAt: '',
  why: '',
  prefs: [],
};

export interface ProfileSubmission {
  intake: ButlerIntake;
  displayName: string;
  photo: File | null;
  /** Take the current photo off the profile. Ignored if `photo` is set. */
  removePhoto: boolean;
  guardianConsent: boolean;
  guardianName: string;
  guardianContact: string;
}

/** What a signed-out visitor is allowed to see. */
export interface PublicButler {
  id: string;
  displayName: string;
  bio: string;
  photoUrl: string;
  jobTypePrefs: string[];
}

/** What a manager sees while reviewing. Includes the raw answers. */
export interface ReviewableProfile extends PublicButler {
  name: string;
  status: ProfileStatus;
  note: string;
  intake: ButlerIntake;
  guardianConsent: boolean;
  guardianName: string;
  guardianContact: string;
  signedUpAt: string;
}

const BUCKET = 'butler-photos';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

async function client() {
  if (!isBackendConfigured()) {
    throw new Error('Butler profiles need the shared database to be connected first — see SETUP.md.');
  }
  const { supabase } = await import('@/lib/supabase');
  return supabase();
}

function publicPhotoUrl(baseUrl: string, path: string): string {
  if (!path) return '';
  return `${baseUrl.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${path}`;
}

function intakeFrom(value: unknown): ButlerIntake {
  const raw = (value ?? {}) as Partial<ButlerIntake>;
  return {
    grade: raw.grade ?? '',
    availability: raw.availability ?? '',
    experience: raw.experience ?? '',
    goodAt: raw.goodAt ?? '',
    why: raw.why ?? '',
    prefs: Array.isArray(raw.prefs) ? raw.prefs : [],
  };
}

/**
 * Suggests what the roster should call someone: first name, last initial.
 *
 * The account carries a full legal name because a manager needs it. The
 * public page does not, and every butler here is a minor — a first name
 * and an initial is enough for a neighbour to greet the right person at
 * the door. Managers can still edit it before approving.
 */
export function suggestDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * Uploads, keeps or removes the photo, saves the answers, and asks the
 * server for a bio draft. Leaves the profile Pending either way — a failed
 * draft is not a reason to lose a submission a butler just spent five
 * minutes on.
 */
export async function submitProfile(submission: ProfileSubmission): Promise<void> {
  const db = await client();

  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error('Sign in again before submitting your profile.');

  // The photo already on file. submit_butler_profile overwrites the
  // column, so this has to be sent back to keep it.
  const { data: current, error: currentError } = await db
    .from('butlers')
    .select('photo_path')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (currentError) throw new Error(`Could not load your current profile: ${currentError.message}`);
  const previousPath = ((current as Record<string, unknown> | null)?.photo_path as string) ?? '';

  let photoPath = submission.removePhoto ? '' : previousPath;
  if (submission.photo) {
    if (submission.photo.size > MAX_PHOTO_BYTES) {
      throw new Error('That photo is over 5MB. Try a smaller one.');
    }
    const extension = submission.photo.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    // Folder per user, because the storage policy keys write access off
    // the first path segment.
    photoPath = `${auth.user.id}/profile-${Date.now()}.${extension}`;
    const { error } = await db.storage
      .from(BUCKET)
      .upload(photoPath, submission.photo, { upsert: true, contentType: submission.photo.type });
    if (error) throw new Error(`Could not upload that photo: ${error.message}`);
  }

  const { error } = await db.rpc('submit_butler_profile', {
    p_intake: submission.intake,
    p_photo_path: photoPath,
    p_display_name: submission.displayName,
    p_guardian_consent: submission.guardianConsent,
    p_guardian_name: submission.guardianName,
    p_guardian_contact: submission.guardianContact,
  });
  if (error) throw new Error(`Could not save your profile: ${error.message}`);

  // The bucket is public, so a removed or replaced photo is only really
  // gone once the file is deleted, not just unlinked from the profile.
  if (previousPath && previousPath !== photoPath) {
    const { error: removeError } = await db.storage.from(BUCKET).remove([previousPath]);
    if (removeError) console.warn('Could not delete the old photo file:', removeError.message);
  }

  const { error: draftError } = await db.functions.invoke('draft-bio', { body: {} });
  if (draftError) {
    console.warn('Bio draft failed; a manager will write one:', draftError.message);
  }
}

export async function getPublicButlers(): Promise<PublicButler[]> {
  const db = await client();
  const { data, error } = await db.rpc('public_butlers');
  if (error) throw new Error(`Could not load the Butler roster: ${error.message}`);

  const base = import.meta.env.VITE_SUPABASE_URL ?? '';
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    displayName: (row.display_name as string) ?? '',
    bio: (row.bio as string) ?? '',
    photoUrl: publicPhotoUrl(base, (row.photo_path as string) ?? ''),
    jobTypePrefs: (row.job_type_prefs as string[]) ?? [],
  }));
}

/** Admin-only by policy: `butlers` grants no read to anyone else. */
export async function getProfilesForReview(): Promise<ReviewableProfile[]> {
  const db = await client();
  const { data, error } = await db
    .from('butlers')
    .select(
      'id,name,display_name,bio,photo_path,job_type_prefs,profile_status,profile_note,intake,guardian_consent,guardian_name,guardian_contact,signed_up_at',
    )
    .order('signed_up_at', { ascending: false });
  if (error) throw new Error(`Could not load Butler profiles: ${error.message}`);

  const base = import.meta.env.VITE_SUPABASE_URL ?? '';
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    name: (row.name as string) ?? '',
    displayName: (row.display_name as string) ?? '',
    bio: (row.bio as string) ?? '',
    photoUrl: publicPhotoUrl(base, (row.photo_path as string) ?? ''),
    jobTypePrefs: (row.job_type_prefs as string[]) ?? [],
    status: ((row.profile_status as string) ?? 'Draft') as ProfileStatus,
    note: (row.profile_note as string) ?? '',
    intake: intakeFrom(row.intake),
    guardianConsent: Boolean(row.guardian_consent),
    guardianName: (row.guardian_name as string) ?? '',
    guardianContact: (row.guardian_contact as string) ?? '',
    signedUpAt: (row.signed_up_at as string) ?? '',
  }));
}

export async function reviewProfile(
  butlerId: string,
  status: Exclude<ProfileStatus, 'Draft'>,
  displayName: string,
  bio: string,
  note: string,
): Promise<void> {
  const db = await client();
  const { error } = await db.rpc('review_butler_profile', {
    p_butler_id: butlerId,
    p_status: status,
    p_display_name: displayName,
    p_bio: bio,
    p_note: note,
  });
  if (error) throw new Error(`Could not save that review: ${error.message}`);
}

/** The signed-in butler's own profile, so they can see where it stands. */
export async function getMyProfile(): Promise<ReviewableProfile | null> {
  const db = await client();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await db
    .from('butlers')
    .select(
      'id,name,display_name,bio,photo_path,job_type_prefs,profile_status,profile_note,intake,guardian_consent,guardian_name,guardian_contact,signed_up_at',
    )
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  const base = import.meta.env.VITE_SUPABASE_URL ?? '';
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    displayName: (row.display_name as string) ?? '',
    bio: (row.bio as string) ?? '',
    photoUrl: publicPhotoUrl(base, (row.photo_path as string) ?? ''),
    jobTypePrefs: (row.job_type_prefs as string[]) ?? [],
    status: ((row.profile_status as string) ?? 'Draft') as ProfileStatus,
    note: (row.profile_note as string) ?? '',
    intake: intakeFrom(row.intake),
    guardianConsent: Boolean(row.guardian_consent),
    guardianName: (row.guardian_name as string) ?? '',
    guardianContact: (row.guardian_contact as string) ?? '',
    signedUpAt: (row.signed_up_at as string) ?? '',
  };
}
