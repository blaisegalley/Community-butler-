/*
 * Community Butler — marketing content queue.
 *
 * Same MVP caveat as store.ts: this persists to localStorage in the admin's
 * browser only. It is additive to store.ts (jobs/Butlers), not a replacement.
 *
 * The two AI-generated caption options live in `captionDrafts` (spec's
 * "caption_draft" holding 2 variants per generateCaptionDrafts). `captionFinal`
 * is empty until an admin approves — either as one of the drafts verbatim
 * ("Approve As-Is") or after editing ("Edit & Approve").
 */

import { read, uid, write } from '@/lib/store';

export type ContentPlatform = 'instagram' | 'facebook' | 'nextdoor';
export type ContentStatus = 'pending_review' | 'approved' | 'posted' | 'rejected';

export interface ContentQueueEntry {
  id: string;
  jobId: string | null;
  platform: ContentPlatform;
  captionDrafts: string[]; // the 2 AI-generated variants
  captionFinal: string; // set on approval (as-is or edited)
  status: ContentStatus;
  trackingLink: string; // /request link with utm_source/utm_campaign appended
  utmCampaign: string;
  scheduledFor: string | null;
  postedAt: string | null;
  createdAt: string;
  postError: string | null; // last publish failure, if any — surfaced in admin UI
}

const KEY = 'cb.contentQueue.v1';

function slugify(text: string): string {
  return (text || 'general')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'general';
}

// Every link we ever post back to /request carries UTM params so job
// requests it generates can be attributed back to this exact post.
export function buildTrackingLink(platform: ContentPlatform, campaign: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const params = new URLSearchParams({ utm_source: platform, utm_campaign: campaign });
  return `${origin}/request?${params.toString()}`;
}

export function getContentQueue(): ContentQueueEntry[] {
  return read<ContentQueueEntry[]>(KEY, []);
}

function saveAll(entries: ContentQueueEntry[]): void {
  write(KEY, entries);
}

export interface NewContentQueueInput {
  jobId: string | null;
  platform: ContentPlatform;
  captionDrafts: string[];
  campaignSlug?: string; // defaults to the job's service, or "seasonal"
}

export function addContentQueueEntry(input: NewContentQueueInput): ContentQueueEntry {
  const entries = getContentQueue();
  const campaign = slugify(input.campaignSlug ?? 'seasonal');
  const entry: ContentQueueEntry = {
    id: uid(),
    jobId: input.jobId,
    platform: input.platform,
    captionDrafts: input.captionDrafts,
    captionFinal: '',
    status: 'pending_review',
    trackingLink: buildTrackingLink(input.platform, campaign),
    utmCampaign: campaign,
    scheduledFor: null,
    postedAt: null,
    createdAt: new Date().toISOString(),
    postError: null,
  };
  entries.unshift(entry);
  saveAll(entries);
  return entry;
}

export function updateContentQueueEntry(id: string, patch: Partial<ContentQueueEntry>): ContentQueueEntry[] {
  const entries = getContentQueue();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx > -1) {
    entries[idx] = { ...entries[idx], ...patch };
    saveAll(entries);
  }
  return entries;
}

export function approveAsIs(id: string, variantIndex = 0): ContentQueueEntry[] {
  const entry = getContentQueue().find((e) => e.id === id);
  const text = entry?.captionDrafts[variantIndex] ?? entry?.captionDrafts[0] ?? '';
  return updateContentQueueEntry(id, { status: 'approved', captionFinal: text, postError: null });
}

export function approveWithEdit(id: string, finalText: string): ContentQueueEntry[] {
  return updateContentQueueEntry(id, { status: 'approved', captionFinal: finalText, postError: null });
}

export function rejectContent(id: string): ContentQueueEntry[] {
  return updateContentQueueEntry(id, { status: 'rejected' });
}

export function markPosted(id: string): ContentQueueEntry[] {
  return updateContentQueueEntry(id, { status: 'posted', postedAt: new Date().toISOString(), postError: null });
}

export function markPostError(id: string, message: string): ContentQueueEntry[] {
  // Publish failed — stay "approved" (not "posted") so the admin can retry,
  // per the spec: never silently fail.
  return updateContentQueueEntry(id, { postError: message });
}

// Guards against re-drafting the same completed job for the same platform
// twice (e.g. auto-trigger firing, then an admin also clicking "Generate
// Post Drafts" manually).
export function hasDraftForJob(jobId: string, platform: ContentPlatform): boolean {
  return getContentQueue().some((e) => e.jobId === jobId && e.platform === platform);
}
