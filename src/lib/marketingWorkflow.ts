/*
 * Wires a completed Job to the content queue — shared by the auto-trigger
 * (job marked Completed) and the admin's manual "Generate Post Drafts"
 * button (Part 2 of the feature spec).
 */

import { Job } from '@/lib/store';
import { addContentQueueEntry, ContentPlatform, hasDraftForJob } from '@/lib/contentQueue';
import { generateCaptionDrafts } from '@/lib/marketingApi';

const PLATFORMS: ContentPlatform[] = ['instagram', 'facebook', 'nextdoor'];

// Drafts posts for all 3 platforms from one completed job. Skips a platform
// that already has a draft for this job, so the auto-trigger firing and an
// admin later clicking "Generate Post Drafts" don't double up.
export async function generateDraftsForJob(job: Job): Promise<void> {
  const platformsToDraft = PLATFORMS.filter((p) => !hasDraftForJob(job.id, p));
  for (const platform of platformsToDraft) {
    const drafts = await generateCaptionDrafts(job, platform);
    addContentQueueEntry({ jobId: job.id, platform, captionDrafts: drafts, campaignSlug: job.service });
  }
}
